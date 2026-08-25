package com.pinturillo.ui;

import com.vaadin.flow.component.html.H1;
import com.vaadin.flow.component.html.Span;
import com.vaadin.flow.component.orderedlayout.VerticalLayout;
import com.vaadin.flow.component.textfield.TextField;
import com.vaadin.flow.router.Route;

@Route("player")
public class PlayerView extends VerticalLayout {

    public PlayerView() {
        add(new H1("Pinturillo · Alumno"));
        add(new Span("Próximamente: únete con el código de sala y adivina tocando tarjetas."));
        add(new TextField("Código de sala"));
    }
}
