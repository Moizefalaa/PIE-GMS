package com.pinturillo.web;

import com.pinturillo.model.Category;
import com.pinturillo.service.WordBankService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class WordBankController {

    private final WordBankService wordBank;

    public WordBankController(WordBankService wordBank) {
        this.wordBank = wordBank;
    }

    @GetMapping("/wordbank")
    public Map<String, Category> getWordBank() {
        return wordBank.getCategories();
    }
}
