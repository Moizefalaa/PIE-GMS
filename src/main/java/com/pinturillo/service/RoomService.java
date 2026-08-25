package com.pinturillo.service;

import com.pinturillo.model.Category;
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
