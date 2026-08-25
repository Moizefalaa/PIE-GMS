package com.pinturillo.model;

import java.util.ArrayList;
import java.util.List;

public class Category {

    private String label;
    private List<String> words = new ArrayList<>();
    private List<String> situations = new ArrayList<>();

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public List<String> getWords() {
        return words;
    }

    public void setWords(List<String> words) {
        this.words = words;
    }

    public List<String> getSituations() {
        return situations;
    }

    public void setSituations(List<String> situations) {
        this.situations = situations;
    }
}
