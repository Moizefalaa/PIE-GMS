package com.pinturillo.model;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

public class Room {

    private final String code;
    private Round round;
    private int correctCount = 0;
    private final List<Player> players = new CopyOnWriteArrayList<>();
    private final Set<String> seenClientIds = new HashSet<>();
    private String lastCategory;
    private String lastMode;
    private boolean lastTimerEnabled;
    private int lastTimerSeconds;

    // Hub + Teléfono Dibujado
    private String currentGame; // "pinturillo" | "telefono" | null
    private final java.util.List<TelefonoStep> telefonoChain = new CopyOnWriteArrayList<>();
    private int telefonoStepIndex = 0;
    private String telefonoCategory;
    private String telefonoMode;
    private String telefonoInitialWord;

    // A Medias
    private AmediasStory amediasCurrent;
    private final Map<String, Integer> amediasVotes = new ConcurrentHashMap<>();

    // Ritmo de Calma
    private boolean ritmoActive;
    private int ritmoCycles;
    private int ritmoCycleMs;
    private long ritmoStartAt;

    public Room(String code) {
        this.code = code;
    }

    public String getCode() {
        return code;
    }

    public Round getRound() {
        return round;
    }

    public void setRound(Round round) {
        this.round = round;
    }

    public int getCorrectCount() {
        return correctCount;
    }

    public void setCorrectCount(int correctCount) {
        this.correctCount = correctCount;
    }

    public List<Player> getPlayers() {
        return players;
    }

    public void addPlayer(Player p) {
        players.add(p);
    }

    public boolean isKnown(String clientId) {
        return seenClientIds.contains(clientId);
    }

    public void markSeen(String clientId) {
        seenClientIds.add(clientId);
    }

    public String getLastCategory() { return lastCategory; }
    public void setLastCategory(String lastCategory) { this.lastCategory = lastCategory; }
    public String getLastMode() { return lastMode; }
    public void setLastMode(String lastMode) { this.lastMode = lastMode; }
    public boolean isLastTimerEnabled() { return lastTimerEnabled; }
    public void setLastTimerEnabled(boolean lastTimerEnabled) { this.lastTimerEnabled = lastTimerEnabled; }
    public int getLastTimerSeconds() { return lastTimerSeconds; }
    public void setLastTimerSeconds(int lastTimerSeconds) { this.lastTimerSeconds = lastTimerSeconds; }

    public String getCurrentGame() { return currentGame; }
    public void setCurrentGame(String currentGame) { this.currentGame = currentGame; }
    public java.util.List<TelefonoStep> getTelefonoChain() { return telefonoChain; }
    public int getTelefonoStepIndex() { return telefonoStepIndex; }
    public void setTelefonoStepIndex(int i) { this.telefonoStepIndex = i; }
    public String getTelefonoCategory() { return telefonoCategory; }
    public void setTelefonoCategory(String c) { this.telefonoCategory = c; }
    public String getTelefonoMode() { return telefonoMode; }
    public void setTelefonoMode(String m) { this.telefonoMode = m; }
    public String getTelefonoInitialWord() { return telefonoInitialWord; }
    public void setTelefonoInitialWord(String w) { this.telefonoInitialWord = w; }
    public void clearTelefono() {
        telefonoChain.clear(); telefonoStepIndex = 0;
        telefonoCategory = null; telefonoMode = null; telefonoInitialWord = null;
    }

    // A Medias
    public AmediasStory getAmediasCurrent() { return amediasCurrent; }
    public void setAmediasCurrent(AmediasStory s) { this.amediasCurrent = s; }
    public Map<String, Integer> getAmediasVotes() { return amediasVotes; }
    public void clearAmedias() { amediasCurrent = null; amediasVotes.clear(); }

    // Ritmo
    public boolean isRitmoActive() { return ritmoActive; }
    public void setRitmoActive(boolean v) { this.ritmoActive = v; }
    public int getRitmoCycles() { return ritmoCycles; }
    public void setRitmoCycles(int v) { this.ritmoCycles = v; }
    public int getRitmoCycleMs() { return ritmoCycleMs; }
    public void setRitmoCycleMs(int v) { this.ritmoCycleMs = v; }
    public long getRitmoStartAt() { return ritmoStartAt; }
    public void setRitmoStartAt(long v) { this.ritmoStartAt = v; }
    public void clearRitmo() { ritmoActive = false; ritmoCycles = 0; ritmoCycleMs = 0; ritmoStartAt = 0; }
}
