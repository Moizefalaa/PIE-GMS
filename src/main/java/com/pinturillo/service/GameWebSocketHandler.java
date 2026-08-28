package com.pinturillo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pinturillo.model.Player;
import com.pinturillo.model.Round;
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
                Room room = roomService.getRoom(code);
                if (room == null) {
                    send(session, Map.of("type", "error", "msg", "Sala no encontrada"));
                    return;
                }
                boolean reconnected = room.isKnown(clientId);
                roomService.joinRoom(code, clientId, alias);
                room.markSeen(clientId);
                Client c = clients.get(session.getId());
                if (c == null) c = new Client();
                c.session = session; c.roomCode = code; c.clientId = clientId;
                if (c.role == null) c.role = "player";
                clients.put(session.getId(), c);
                send(session, Map.of("type", "joined", "id", clientId, "reconnected", reconnected));
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
                if (room.getCurrentGame() != null) {
                    send(session, Map.of("type", "game_selected", "game", room.getCurrentGame()));
                }
                if (!room.getTelefonoChain().isEmpty()) {
                    sendTelefonoRoundTo(session, room);
                }
                sendPlayers(room);
            }
            case "host_select_game" -> {
                if (self == null || !"host".equals(self.role)) return;
                String game = (String) msg.get("game");
                if (game == null) game = "pinturillo";
                Room room = roomService.getRoom(self.roomCode);
                if (room == null) return;
                room.setCurrentGame(game);
                if ("telefono".equals(game)) {
                    room.setRound(null);
                    cancelTimer(self.roomCode);
                    broadcast(self.roomCode, Map.of("type", "draw_clear"), null);
                } else {
                    room.clearTelefono();
                    broadcast(self.roomCode, Map.of("type", "draw_clear"), null);
                }
                broadcast(self.roomCode, Map.of("type", "game_selected", "game", game), null);
            }
            case "telefono_start" -> {
                if (self == null || !"host".equals(self.role)) return;
                String code = self.roomCode;
                String category = (String) msg.get("category");
                String mode = (String) msg.get("mode");
                Room room = roomService.getRoom(code);
                if (room == null) return;
                if (category == null) category = "emociones";
                if (mode == null) mode = "words";
                boolean ok = roomService.startTelefono(code, category, mode);
                if (!ok) {
                    send(session, Map.of("type", "error", "msg", "No se pudo iniciar Teléfono Dibujado"));
                    return;
                }
                broadcast(code, Map.of("type", "draw_clear"), null);
                sendTelefonoRound(room);
            }
            case "telefono_submit_drawing" -> {
                if (self == null) return;
                String imageData = (String) msg.get("imageData");
                // imageData may be large; allow up to ~1MB base64
                boolean ok = roomService.submitTelefonoDrawing(self.roomCode, self.clientId, imageData == null ? "" : imageData);
                if (!ok) { send(session, Map.of("type", "error", "msg", "No se pudo guardar el dibujo")); return; }
                Room room = roomService.getRoom(self.roomCode);
                if (room == null) return;
                // if chain still has next step (guess), send next round; else we are at final draw awaiting reveal
                if (room.getTelefonoStepIndex() < room.getTelefonoChain().size()) {
                    // check if next step is guess (we just advanced)
                    com.pinturillo.model.TelefonoStep cur = room.getTelefonoChain().get(room.getTelefonoStepIndex());
                    if ("guess".equals(cur.getType())) {
                        sendTelefonoRound(room);
                    } else {
                        // edge: consecutive draws? should not happen, but send
                        sendTelefonoRound(room);
                    }
                } else {
                    // final draw submitted, chain at end — host can reveal
                    broadcast(self.roomCode, Map.of("type", "telefono_waiting_reveal"), null);
                }
            }
            case "telefono_guess" -> {
                if (self == null) return;
                Number n = (Number) msg.get("optionId");
                if (n == null) return;
                boolean ok = roomService.guessTelefono(self.roomCode, self.clientId, n.intValue());
                if (!ok) { send(session, Map.of("type", "error", "msg", "No se pudo registrar la elección")); return; }
                Room room = roomService.getRoom(self.roomCode);
                if (room == null) return;
                // send ack to guesser
                Map<String, Object> ack = new HashMap<>();
                ack.put("type", "telefono_guess_result");
                // guess text for feedback
                com.pinturillo.model.TelefonoStep cur = room.getTelefonoChain().get(room.getTelefonoStepIndex() - (room.getTelefonoStepIndex() < room.getTelefonoChain().size() && "draw".equals(room.getTelefonoChain().get(room.getTelefonoStepIndex()).getType()) ? 1 : 0));
                // simpler: last guess step is previous
                send(session, ack);
                // advance check: if there is a next draw step, notify it
                if (room.getTelefonoStepIndex() < room.getTelefonoChain().size()) {
                    com.pinturillo.model.TelefonoStep next = room.getTelefonoChain().get(room.getTelefonoStepIndex());
                    if ("draw".equals(next.getType())) {
                        sendTelefonoRound(room);
                    }
                } else {
                    broadcast(self.roomCode, Map.of("type", "telefono_waiting_reveal"), null);
                }
                // broadcast progress to host
                Client host = findHost(self.roomCode);
                if (host != null) {
                    Map<String, Object> prog = new HashMap<>();
                    prog.put("type", "telefono_progress");
                    prog.put("step", room.getTelefonoStepIndex() + 1);
                    prog.put("total", room.getPlayers().size());
                    send(host.session, prog);
                }
            }
            case "host_start" -> {
                if (self == null || !"host".equals(self.role)) return;
                String code = self.roomCode;
                String category = (String) msg.get("category");
                String mode = (String) msg.get("mode");
                String drawerId = (String) msg.get("drawerId");
                boolean timerEnabled = Boolean.parseBoolean(String.valueOf(msg.get("timerEnabled")));
                Number tsec = (Number) msg.get("timerSeconds");
                int timerSeconds = tsec == null ? 0 : tsec.intValue();
                Room room = roomService.getRoom(code);
                if (room == null) return;
                room.setLastCategory(category);
                room.setLastMode(mode);
                room.setLastTimerEnabled(timerEnabled);
                room.setLastTimerSeconds(timerSeconds);
                Round round = roomService.startRound(code, category, mode, drawerId);
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
                    scheduleTimer(room, timerSeconds);
                }
            }
            case "host_reveal" -> {
                if (self == null || !"host".equals(self.role)) return;
                cancelTimer(self.roomCode);
                Room room = roomService.getRoom(self.roomCode);
                if (room == null) return;
                if ("telefono".equals(room.getCurrentGame())) {
                    // revela la cadena completa
                    List<Map<String, Object>> chainView = new ArrayList<>();
                    for (com.pinturillo.model.TelefonoStep s : room.getTelefonoChain()) {
                        Map<String, Object> e = new HashMap<>();
                        e.put("type", s.getType());
                        e.put("playerId", s.getPlayerId());
                        e.put("alias", s.getAlias());
                        if ("draw".equals(s.getType())) {
                            e.put("word", s.getWord());
                            e.put("imageData", s.getImageData());
                        } else {
                            e.put("guessText", s.getGuessText());
                            e.put("guessOptionId", s.getGuessOptionId());
                            if (s.getOptions() != null) e.put("options", s.getOptions());
                        }
                        chainView.add(e);
                    }
                    Map<String, Object> rev = new HashMap<>();
                    rev.put("type", "telefono_chain_reveal");
                    rev.put("chain", chainView);
                    rev.put("initialWord", room.getTelefonoInitialWord());
                    broadcast(self.roomCode, rev, null);
                } else if (room.getRound() != null) {
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
                if (room == null) return;
                broadcast(self.roomCode, Map.of("type", "draw_clear"), null);
                if ("telefono".equals(room.getCurrentGame())) {
                    room.clearTelefono();
                    Client host = findHost(self.roomCode);
                    if (host != null) send(host.session, Map.of("type", "cleared"));
                    broadcast(self.roomCode, Map.of("type", "telefono_cleared"), null);
                    return;
                }
                String prevDrawer = room.getRound() != null ? room.getRound().getDrawerId() : null;
                room.setRound(null);
                List<Player> ps = room.getPlayers();
                if (ps.isEmpty()) {
                    Client host = findHost(self.roomCode);
                    if (host != null) send(host.session, Map.of("type", "cleared"));
                    return;
                }
                int idx = 0;
                if (prevDrawer != null) {
                    for (int i = 0; i < ps.size(); i++) {
                        if (ps.get(i).getClientId().equals(prevDrawer)) { idx = i; break; }
                    }
                }
                int nextIdx = (idx + 1) % ps.size();
                String nextDrawer = ps.get(nextIdx).getClientId();
                Round round = roomService.startRound(self.roomCode, room.getLastCategory(), room.getLastMode(), nextDrawer);
                roomService.resetGuesses(self.roomCode);
                if (round == null) {
                    send(session, Map.of("type", "error", "msg", "Categoria sin suficientes palabras"));
                    return;
                }
                sendRound(room);
                Client host = findHost(self.roomCode);
                if (host != null) {
                    send(host.session, Map.of("type", "progress", "correct", 0, "total", room.getPlayers().size()));
                }
                if (room.isLastTimerEnabled() && room.getLastTimerSeconds() > 0) {
                    scheduleTimer(room, room.getLastTimerSeconds());
                }
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
                }
                Player p = roomService.getRoom(self.roomCode).getPlayers().stream()
                        .filter(x -> x.getClientId().equals(self.clientId)).findFirst().orElse(null);
                broadcast(self.roomCode, Map.of("type", "guess_event", "clientId", self.clientId,
                        "alias", p != null ? p.getAlias() : "", "correct", res.correct()), null);
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

    private void sendTelefonoRound(Room room) {
        if (room.getTelefonoChain().isEmpty()) return;
        int idx = room.getTelefonoStepIndex();
        if (idx < 0 || idx >= room.getTelefonoChain().size()) return;
        com.pinturillo.model.TelefonoStep cur = room.getTelefonoChain().get(idx);
        for (Client c : clients.values()) {
            if (!c.roomCode.equals(room.getCode())) continue;
            Map<String, Object> m = new HashMap<>();
            m.put("type", "telefono_round");
            m.put("stepIndex", idx);
            m.put("totalSteps", room.getPlayers().size());
            m.put("stepType", cur.getType());
            m.put("alias", cur.getAlias());
            if ("draw".equals(cur.getType())) {
                m.put("drawerId", cur.getPlayerId());
                m.put("word", c.clientId.equals(cur.getPlayerId()) ? cur.getWord() : null);
            } else {
                m.put("guesserId", cur.getPlayerId());
                String img = null;
                if (idx > 0) {
                    com.pinturillo.model.TelefonoStep prev = room.getTelefonoChain().get(idx - 1);
                    if ("draw".equals(prev.getType())) img = prev.getImageData();
                }
                m.put("imageData", img);
                m.put("options", cur.getOptions());
            }
            send(c.session, m);
        }
    }

    private void sendTelefonoRoundTo(WebSocketSession session, Room room) {
        if (room.getTelefonoChain().isEmpty()) return;
        int idx = room.getTelefonoStepIndex();
        if (idx < 0 || idx >= room.getTelefonoChain().size()) return;
        com.pinturillo.model.TelefonoStep cur = room.getTelefonoChain().get(idx);
        Client cli = clients.get(session.getId());
        if (cli == null) return;
        Map<String, Object> m = new HashMap<>();
        m.put("type", "telefono_round");
        m.put("stepIndex", idx);
        m.put("totalSteps", room.getPlayers().size());
        m.put("stepType", cur.getType());
        m.put("alias", cur.getAlias());
        if ("draw".equals(cur.getType())) {
            m.put("drawerId", cur.getPlayerId());
            m.put("word", cli.clientId.equals(cur.getPlayerId()) ? cur.getWord() : null);
        } else {
            m.put("guesserId", cur.getPlayerId());
            String img = null;
            if (idx > 0) {
                com.pinturillo.model.TelefonoStep prev = room.getTelefonoChain().get(idx - 1);
                if ("draw".equals(prev.getType())) img = prev.getImageData();
            }
            m.put("imageData", img);
            m.put("options", cur.getOptions());
        }
        send(session, m);
    }

    private void scheduleTimer(Room room, int timerSeconds) {
        String code = room.getCode();
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
                Room r = roomService.getRoom(code);
                if (r != null && r.getRound() != null) {
                    Map<String, Object> rev = new HashMap<>();
                    rev.put("type", "reveal");
                    rev.put("word", r.getRound().getWord());
                    broadcast(code, rev, null);
                }
            }
        }, 0, 1, TimeUnit.SECONDS);
        timers.put(code, f);
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
            String payload = mapper.writeValueAsString(msg);
            // Serializa escrituras: el hilo del temporizador (tick) y el de mensajes
            // pueden escribir a la misma sesion a la vez y sendMessage no es thread-safe.
            synchronized (s) {
                s.sendMessage(new TextMessage(payload));
            }
        } catch (Exception ignored) {
        }
    }
}
