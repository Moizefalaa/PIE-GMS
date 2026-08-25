package com.pinturillo.model;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
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
}
