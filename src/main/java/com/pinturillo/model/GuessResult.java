package com.pinturillo.model;

public record GuessResult(boolean correct, boolean counted, int correctCount, int total) {
}
