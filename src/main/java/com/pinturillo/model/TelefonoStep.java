package com.pinturillo.model;

public class TelefonoStep {
    private String type; // "draw" | "guess"
    private String playerId;
    private String alias;
    private String word; // prompt for draw steps (only visible to drawer)
    private String imageData; // base64 dataURL of drawing (stored after draw submit)
    private Integer guessOptionId; // chosen option
    private String guessText; // text of chosen option
    private java.util.List<Round.Option> options; // options shown for guess steps (snapshot)

    public TelefonoStep() {}
    public TelefonoStep(String type, String playerId, String alias) {
        this.type = type; this.playerId = playerId; this.alias = alias;
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }
    public String getAlias() { return alias; }
    public void setAlias(String alias) { this.alias = alias; }
    public String getWord() { return word; }
    public void setWord(String word) { this.word = word; }
    public String getImageData() { return imageData; }
    public void setImageData(String imageData) { this.imageData = imageData; }
    public Integer getGuessOptionId() { return guessOptionId; }
    public void setGuessOptionId(Integer guessOptionId) { this.guessOptionId = guessOptionId; }
    public String getGuessText() { return guessText; }
    public void setGuessText(String guessText) { this.guessText = guessText; }
    public java.util.List<Round.Option> getOptions() { return options; }
    public void setOptions(java.util.List<Round.Option> options) { this.options = options; }
}
