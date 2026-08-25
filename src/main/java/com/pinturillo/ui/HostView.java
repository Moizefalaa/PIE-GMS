package com.pinturillo.ui;

import com.pinturillo.model.Round;
import com.pinturillo.model.Room;
import com.pinturillo.service.RoomService;
import com.pinturillo.service.WordBankService;
import com.vaadin.flow.component.button.Button;
import com.vaadin.flow.component.html.H1;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.orderedlayout.HorizontalLayout;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.select.Select;
import com.vaadin.flow.router.Route;

import java.util.ArrayList;
import java.util.List;

@Route("host")
public class HostView extends VerticalLayout {

    private final RoomService roomService;
    private final WordBankService wordBank;
    private Room room;

    private final Span codeSpan = new Span("----");
    private final Select<String> categorySelect = new Select<>();
    private final Select<String> modeSelect = new Select<>();
    private final VerticalLayout roundPanel = new VerticalLayout();

    public HostView(RoomService roomService, WordBankService wordBank) {
        this.roomService = roomService;
        this.wordBank = wordBank;

        H1 title = new H1("Pinturillo · Integración");
        Button create = new Button("Crear sala", e -> createRoom());
        categorySelect.setLabel("Categoría");
        modeSelect.setLabel("Modo");
        modeSelect.setItems("words", "situations");
        modeSelect.setValue("words");
        Button start = new Button("Iniciar ronda", e -> startRound());

        add(title, create, new HorizontalLayout(new Span("Código de sala:"), codeSpan),
                categorySelect, modeSelect, start, roundPanel);
    }

    private void createRoom() {
        room = roomService.createRoom();
        codeSpan.setText(room.getCode());

        List<String> keys = new ArrayList<>(wordBank.getCategories().keySet());
        categorySelect.setItems(keys);
        categorySelect.setItemLabelGenerator(k -> wordBank.getCategories().get(k).getLabel());
        if (!keys.isEmpty()) {
            categorySelect.setValue(keys.get(0));
        }
    }

    private void startRound() {
        if (room == null) {
            roundPanel.add(new Span("Primero crea una sala."));
            return;
        }
        Round r = roomService.startRound(room.getCode(), categorySelect.getValue(), modeSelect.getValue(), "host");
        roundPanel.removeAll();
        if (r == null) {
            roundPanel.add(new Span("Categoría sin suficientes palabras."));
            return;
        }
        roundPanel.add(new Span("Dibuja: " + r.getWord()));
        for (Round.Option o : r.getOptions()) {
            roundPanel.add(new Span("• " + o.getText()));
        }
    }
}
