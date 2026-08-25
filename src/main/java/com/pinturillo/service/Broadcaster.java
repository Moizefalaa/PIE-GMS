package com.pinturillo.service;

import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/**
 * Utilidad para difusión en tiempo real (fases posteriores).
 * Los componentes de Vaadin se registran aqui y reaccionan dentro de UI.access().
 */
public class Broadcaster {

    private static final Set<Consumer<String>> LISTENERS =
            Collections.newSetFromMap(new ConcurrentHashMap<>());

    public static void register(Consumer<String> listener) {
        LISTENERS.add(listener);
    }

    public static void unregister(Consumer<String> listener) {
        LISTENERS.remove(listener);
    }

    public static void broadcast(String message) {
        LISTENERS.forEach(l -> l.accept(message));
    }
}
