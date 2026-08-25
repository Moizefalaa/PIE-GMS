package com.pinturillo.model;

import java.util.List;

public class Round {

    private final String category;
    private final String mode;
    private final String word;
    private final List<Option> options;
    private final int correctId;
    private final String drawerId;

    public Round(String category, String mode, String word, List<Option> options, int correctId, String drawerId) {
        this.category = category;
        this.mode = mode;
        this.word = word;
        this.options = options;
        this.correctId = correctId;
        this.drawerId = drawerId;
    }

    public String getCategory() {
        return category;
    }

    public String getMode() {
        return mode;
    }

    public String getWord() {
        return word;
    }

    public List<Option> getOptions() {
        return options;
    }

    public int getCorrectId() {
        return correctId;
    }

    public String getDrawerId() {
        return drawerId;
    }

    public static class Option {
        private final int id;
        private final String text;

        public Option(int id, String text) {
            this.id = id;
            this.text = text;
        }

        public int getId() {
            return id;
        }

        public String getText() {
            return text;
        }
    }
}
