package com.pinturillo.model;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

public class Room {

    private final String code;
    private Round round;
    private int correctCount = 0;
    private final List<Player> players = new CopyOnWriteArrayList<>();

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
}
