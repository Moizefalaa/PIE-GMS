package com.pinturillo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pinturillo.model.Player;
import com.pinturillo.model.Room;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    private final RoomService roomService;
    private final WordBankService wordBank;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    private final Map<String, ScheduledFuture<?>> timers = new ConcurrentHashMap<>();

    public GameWebSocketHandler(RoomService roomService, WordBankService wordBank) {
        this.roomService = roomService;
        this.wordBank = wordBank;
    }

    private static class Client {
        WebSocketSession session;
        String roomCode;
        String clientId;
        String role;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // espera a host_create / join
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        Map<String, Object> msg = mapper.readValue(message.getPayload(), Map.class);
        String type = (String) msg.get("type");
        Client self = clients.get(session.getId());

        switch (type) {
            case "host_create" -> {
                Room room = roomService.createRoom();
                Client c = new Client();
                c.session = session; c.roomCode = room.getCode(); c.clientId = "host"; c.role = "host";
                clients.put(session.getId(), c);
                send(session, Map.of("type", "room_created", "code", room.getCode()));
            }
            case "join" -> {
                String code = (String) msg.get("code");
                String clientId = (String) msg.get("clientId");
                String alias = (String) msg.get("alias");
                Player p = roomService.joinRoom(code, clientId, alias);
                if (p == null) {
                    send(session, Map.of("type", "error", "msg", "Sala no encontrada"));
                    return;
                }
                Client c = new Client();
                c.session = session; c.roomCode = code; c.clientId = clientId; c.role = "player";
                clients.put(session.getId(), c);
                boolean reconnected = self != null;
                send(session, Map.of("type", "joined", "id", clientId, "reconnected", reconnected));
                Room room = roomService.getRoom(code);
                if (room.getRound() != null) {
                    boolean isDrawer = clientId.equals(room.getRound().getDrawerId());
                    Map<String, Object> r = new HashMap<>();
                    r.put("type", "round");
                    r.put("word", isDrawer ? room.getRound().getWord() : null);
                    r.put("options", room.getRound().getOptions());
                    r.put("drawerId", room.getRound().getDrawerId());
                    r.put("mode", room.getRound().getMode());
                    send(session, r);
                }
                sendPlayers(room);
            }
            case "host_start" -> {
                if (self == null || !"host".equals(self.role)) return;
                String code = self.roomCode;
                String category = (String) msg.get("category");
                String mode = (String) msg.get("mode");
                String drawerId = (String) msg.get("drawerId");
                boolean timerEnabled = Boolean.parseBoolean(String.valueOf(msg.get("timerEnabled")));
                int timerSeconds = ((Number) msg.get("timerSeconds")).intValue();
                Room room = roomService.getRoom(code);
                if (room == null) return;
                Room round = roomService.startRound(code, category, mode, drawerId);
                roomService.resetGuesses(code);
                if (round == null) {
                    send(session, Map.of("type", "error", "msg", "Categoria sin suficientes palabras"));
                    return;
                }
                sendRound(room);
                Client host = findHost(code);
                if (host != null) {
                    send(host.session, Map.of("type", "progress", "correct", 0, "total", room.getPlayers().size()));
                }
                if (timerEnabled && timerSeconds > 0) {
                    long endsAt = System.currentTimeMillis() + timerSeconds * 1000L;
                    ScheduledFuture<?> f = scheduler.scheduleAtFixedRate(() -> {
                        int rem = (int) Math.max(0, Math.ceil((endsAt - System.currentTimeMillis()) / 1000.0));
                        Map<String, Object> t = new HashMap<>();
                        t.put("type", "tick");
                        t.put("remaining", rem);
                        broadcast(code, t, null);
                        if (rem <= 0) {
                            ScheduledFuture<?> fut = timers.remove(code);
                            if (fut != null) fut.cancel(false);
                            if (room.getRound() != null) {
                                Map<String, Object> rev = new HashMap<>();
                                rev.put("type", "reveal");
                                rev.put("word", room.getRound().getWord());
                                broadcast(code, rev, null);
                            }
                        }
                    }, 0, 1, TimeUnit.SECONDS);
                    timers.put(code, f);
                }
            }
            case "host_reveal" -> {
                if (self == null || !"host".equals(self.role)) return;
                cancelTimer(self.roomCode);
                Room room = roomService.getRoom(self.roomCode);
                if (room != null && room.getRound() != null) {
                    Map<String, Object> rev = new HashMap<>();
                    rev.put("type", "reveal");
                    rev.put("word", room.getRound().getWord());
                    broadcast(self.roomCode, rev, null);
                }
            }
            case "host_next" -> {
                if (self == null || !"host".equals(self.role)) return;
                cancelTimer(self.roomCode);
                Room room = roomService.getRoom(self.roomCode);
                broadcast(self.roomCode, Map.of("type", "draw_clear"), null);
                if (room != null) room.setRound(null);
                Client host = findHost(self.roomCode);
                if (host != null) send(host.session, Map.of("type", "cleared"));
            }
            case "guess" -> {
                if (self == null) return;
                int optionId = ((Number) msg.get("optionId")).intValue();
                com.pinturillo.model.GuessResult res = roomService.guess(self.roomCode, self.clientId, optionId);
                if (res == null) return;
                Map<String, Object> gr = new HashMap<>();
                gr.put("type", "guess_result");
                gr.put("correct", res.correct());
                gr.put("text", currentWord(self.roomCode));
                send(session, gr);
                Client host = findHost(self.roomCode);
                if (host != null) {
                    send(host.session, Map.of("type", "progress", "correct", res.correctCount(), "total", res.total()));
                    Player p = roomService.getRoom(self.roomCode).getPlayers().stream()
                            .filter(x -> x.getClientId().equals(self.clientId)).findFirst().orElse(null);
                    send(host.session, Map.of("type", "guess_event", "clientId", self.clientId,
                            "alias", p != null ? p.getAlias() : "", "correct", res.correct()));
                }
            }
            case "draw", "draw_clear" -> {
                if (self == null) return;
                broadcast(self.roomCode, msg, session.getId());
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, org.springframework.web.socket.CloseStatus status) {
        Client c = clients.remove(session.getId());
        if (c == null) return;
        if ("host".equals(c.role)) {
            cancelTimer(c.roomCode);
            roomService.removeRoom(c.roomCode);
        } else {
            roomService.removePlayer(c.roomCode, c.clientId);
            Room room = roomService.getRoom(c.roomCode);
            if (room != null) sendPlayers(room);
        }
    }

    private String currentWord(String code) {
        Room r = roomService.getRoom(code);
        return (r != null && r.getRound() != null) ? r.getRound().getWord() : "";
    }

    private Client findHost(String code) {
        for (Client c : clients.values()) {
            if (code.equals(c.roomCode) && "host".equals(c.role)) return c;
        }
        return null;
    }

    private void sendRound(Room room) {
        Map<String, Object> base = new HashMap<>();
        base.put("options", room.getRound().getOptions());
        base.put("drawerId", room.getRound().getDrawerId());
        base.put("mode", room.getRound().getMode());
        for (Client c : clients.values()) {
            if (!c.roomCode.equals(room.getCode())) continue;
            Map<String, Object> m = new HashMap<>(base);
            m.put("type", "round");
            boolean isDrawer = c.clientId.equals(room.getRound().getDrawerId());
            m.put("word", isDrawer ? room.getRound().getWord() : null);
            send(c.session, m);
        }
    }

    private void sendPlayers(Room room) {
        List<Map<String, String>> list = new ArrayList<>();
        for (Player p : room.getPlayers()) {
            Map<String, String> e = new HashMap<>();
            e.put("clientId", p.getClientId());
            e.put("alias", p.getAlias());
            list.add(e);
        }
        for (Client c : clients.values()) {
            if (room.getCode().equals(c.roomCode) && "host".equals(c.role)) {
                Map<String, Object> m = new HashMap<>();
                m.put("type", "players");
                m.put("players", list);
                send(c.session, m);
            }
        }
    }

    private void broadcast(String roomCode, Map<String, Object> msg, String excludeSessionId) {
        for (Client c : clients.values()) {
            if (!c.roomCode.equals(roomCode)) continue;
            if (excludeSessionId != null && excludeSessionId.equals(c.session.getId())) continue;
            send(c.session, msg);
        }
    }

    private void cancelTimer(String code) {
        ScheduledFuture<?> f = timers.remove(code);
        if (f != null) f.cancel(false);
    }

    private void send(WebSocketSession s, Object msg) {
        if (s == null || !s.isOpen()) return;
        try {
            s.sendMessage(new TextMessage(mapper.writeValueAsString(msg)));
        } catch (Exception ignored) {
        }
    }
}
