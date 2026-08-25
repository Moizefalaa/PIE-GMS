package com.pinturillo.model;

public class Player {

    private String clientId;
    private String alias;
    private String role; // "host" | "player"

    public Player(String clientId, String alias, String role) {
        this.clientId = clientId;
        this.alias = alias;
        this.role = role;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getAlias() {
        return alias;
    }

    public void setAlias(String alias) {
        this.alias = alias;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }
}
