package com.pinturillo.service;

import com.pinturillo.model.Category;
import com.pinturillo.model.GuessResult;
import com.pinturillo.model.Player;
import com.pinturillo.model.Round;
import com.pinturillo.model.Room;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RoomService {

    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final WordBankService wordBank;
    private final SecureRandom random = new SecureRandom();

    public RoomService(WordBankService wordBank) {
        this.wordBank = wordBank;
    }

    public Room createRoom() {
        String code;
        do {
            code = String.valueOf(1000 + random.nextInt(9000));
        } while (rooms.containsKey(code));
        Room room = new Room(code);
        rooms.put(code, room);
        return room;
    }

    public Room getRoom(String code) {
        return rooms.get(code);
    }

    public void removeRoom(String code) {
        rooms.remove(code);
    }

    public Player joinRoom(String code, String clientId, String alias) {
        Room room = rooms.get(code);
        if (room == null) return null;
        Player p = room.getPlayers().stream()
                .filter(x -> x.getClientId().equals(clientId))
                .findFirst()
                .orElse(null);
        if (p != null) {
            p.setAlias(alias);
        } else {
            p = new Player(clientId, alias, "player");
            room.addPlayer(p);
        }
        return p;
    }

    public void removePlayer(String code, String clientId) {
        Room room = rooms.get(code);
        if (room == null) return;
        room.getPlayers().removeIf(p -> p.getClientId().equals(clientId));
    }

    public GuessResult guess(String code, String clientId, int optionId) {
        Room room = rooms.get(code);
        if (room == null || room.getRound() == null) return null;
        Player p = room.getPlayers().stream()
                .filter(x -> x.getClientId().equals(clientId))
                .findFirst()
                .orElse(null);
        if (p == null || p.isGuessed()) {
            int total = room.getPlayers().size();
            return new GuessResult(false, false, room.getCorrectCount(), total);
        }
        p.setGuessed(true);
        boolean correct = optionId == room.getRound().getCorrectId();
        if (correct) room.setCorrectCount(room.getCorrectCount() + 1);
        return new GuessResult(correct, true, room.getCorrectCount(), room.getPlayers().size());
    }

    public void resetGuesses(String code) {
        Room room = rooms.get(code);
        if (room == null) return;
        room.getPlayers().forEach(p -> p.setGuessed(false));
        room.setCorrectCount(0);
    }

    public Round startRound(String code, String categoryKey, String mode, String drawerId) {
        Room room = rooms.get(code);
        if (room == null) return null;
        Category cat = wordBank.getCategories().get(categoryKey);
        if (cat == null) return null;
        List<String> pool = "situations".equals(mode) ? cat.getSituations() : cat.getWords();
        if (pool == null || pool.size() < 4) return null;

        String correct = pool.get(random.nextInt(pool.size()));
        List<String> distract = new ArrayList<>(pool);
        distract.remove(correct);
        Collections.shuffle(distract);
        distract = distract.subList(0, 3);

        List<String> all = new ArrayList<>();
        all.add(correct);
        all.addAll(distract);
        Collections.shuffle(all);

        List<Round.Option> options = new ArrayList<>();
        int id = 0;
        for (String text : all) {
            options.add(new Round.Option(id++, text));
        }
        int correctId = options.stream()
                .filter(o -> o.getText().equals(correct))
                .findFirst()
                .orElseThrow()
                .getId();

        Round round = new Round(categoryKey, mode, correct, options, correctId, drawerId);
        room.setRound(round);
        return round;
    }
}
