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

    // ===== Hub & Teléfono Dibujado =====

    public boolean startTelefono(String code, String categoryKey, String mode) {
        Room room = rooms.get(code);
        if (room == null || room.getPlayers().isEmpty()) return false;
        Category cat = wordBank.getCategories().get(categoryKey);
        if (cat == null) return false;
        List<String> pool = "situations".equals(mode) ? cat.getSituations() : cat.getWords();
        if (pool == null || pool.size() < 4) return false;

        String initialWord = pool.get(random.nextInt(pool.size()));
        room.clearTelefono();
        room.setCurrentGame("telefono");
        room.setTelefonoCategory(categoryKey);
        room.setTelefonoMode(mode);
        room.setTelefonoInitialWord(initialWord);
        // first step: draw by first player in join order
        Player first = room.getPlayers().get(0);
        com.pinturillo.model.TelefonoStep firstStep = new com.pinturillo.model.TelefonoStep("draw", first.getClientId(), first.getAlias());
        firstStep.setWord(initialWord);
        room.getTelefonoChain().add(firstStep);
        room.setTelefonoStepIndex(0);
        room.setRound(null);
        return true;
    }

    public boolean submitTelefonoDrawing(String code, String clientId, String imageData) {
        Room room = rooms.get(code);
        if (room == null || room.getTelefonoChain().isEmpty()) return false;
        int idx = room.getTelefonoStepIndex();
        if (idx < 0 || idx >= room.getTelefonoChain().size()) return false;
        com.pinturillo.model.TelefonoStep step = room.getTelefonoChain().get(idx);
        if (!"draw".equals(step.getType()) || !step.getPlayerId().equals(clientId)) return false;
        step.setImageData(imageData);
        // if already at end (last player) -> mark complete (stepIndex past end)
        if (idx + 1 >= room.getPlayers().size()) {
            room.setTelefonoStepIndex(room.getTelefonoChain().size());
            return true;
        }
        // create next guess step for next player
        int nextPlayerIdx = idx + 1;
        if (nextPlayerIdx >= room.getPlayers().size()) return true;
        Player next = room.getPlayers().get(nextPlayerIdx);
        com.pinturillo.model.TelefonoStep guessStep = new com.pinturillo.model.TelefonoStep("guess", next.getClientId(), next.getAlias());
        // generate options for this guess: correct = word that was just drawn
        List<String> pool = getPool(room.getTelefonoCategory(), room.getTelefonoMode());
        if (pool == null || pool.size() < 4) pool = java.util.Arrays.asList(step.getWord(), "opción 2", "opción 3", "opción 4");
        List<Round.Option> opts = buildOptions(step.getWord(), pool);
        guessStep.setOptions(opts);
        guessStep.setWord(step.getWord()); // reference word to compare
        room.getTelefonoChain().add(guessStep);
        room.setTelefonoStepIndex(idx + 1);
        return true;
    }

    public boolean guessTelefono(String code, String clientId, int optionId) {
        Room room = rooms.get(code);
        if (room == null || room.getTelefonoChain().isEmpty()) return false;
        int idx = room.getTelefonoStepIndex();
        if (idx < 0 || idx >= room.getTelefonoChain().size()) return false;
        com.pinturillo.model.TelefonoStep step = room.getTelefonoChain().get(idx);
        if (!"guess".equals(step.getType()) || !step.getPlayerId().equals(clientId)) return false;
        if (step.getOptions() == null) return false;
        Round.Option chosen = step.getOptions().stream().filter(o -> o.getId() == optionId).findFirst().orElse(null);
        if (chosen == null) return false;
        step.setGuessOptionId(optionId);
        step.setGuessText(chosen.getText());
        // if chain not yet complete, create next draw step for following player
        if (idx + 1 >= room.getPlayers().size()) {
            room.setTelefonoStepIndex(room.getTelefonoChain().size());
            return true; // end of chain after this guess
        }
        int nextPlayerIdx = idx + 1;
        Player next = room.getPlayers().get(nextPlayerIdx);
        com.pinturillo.model.TelefonoStep drawStep = new com.pinturillo.model.TelefonoStep("draw", next.getClientId(), next.getAlias());
        drawStep.setWord(chosen.getText()); // next drawer draws what was just guessed
        room.getTelefonoChain().add(drawStep);
        room.setTelefonoStepIndex(idx + 1);
        return true;
    }

    private List<String> getPool(String categoryKey, String mode) {
        Category cat = wordBank.getCategories().get(categoryKey);
        if (cat == null) return null;
        return "situations".equals(mode) ? cat.getSituations() : cat.getWords();
    }

    private List<Round.Option> buildOptions(String correct, List<String> pool) {
        List<String> distract = new ArrayList<>(pool);
        distract.remove(correct);
        Collections.shuffle(distract);
        distract = distract.subList(0, Math.min(3, distract.size()));
        List<String> all = new ArrayList<>();
        all.add(correct);
        all.addAll(distract);
        while (all.size() < 4) all.add("opción");
        Collections.shuffle(all);
        List<Round.Option> options = new ArrayList<>();
        int id = 0;
        for (String t : all) options.add(new Round.Option(id++, t));
        return options;
    }
}
