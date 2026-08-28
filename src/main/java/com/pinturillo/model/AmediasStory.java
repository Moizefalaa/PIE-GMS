package com.pinturillo.model;

import java.util.List;

public class AmediasStory {
    private final String prompt;
    private final List<Round.Option> options;
    private final int correctId;
    private final String correctText;

    public AmediasStory(String prompt, List<Round.Option> options, int correctId) {
        this.prompt = prompt;
        this.options = options;
        this.correctId = correctId;
        this.correctText = options.stream().filter(o -> o.getId() == correctId).map(Round.Option::getText).findFirst().orElse("");
    }

    public String getPrompt() { return prompt; }
    public List<Round.Option> getOptions() { return options; }
    public int getCorrectId() { return correctId; }
    public String getCorrectText() { return correctText; }
}
