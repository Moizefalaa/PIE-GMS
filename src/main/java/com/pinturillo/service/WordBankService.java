package com.pinturillo.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pinturillo.model.Category;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class WordBankService {

    private Map<String, Category> categories = Collections.emptyMap();

    @PostConstruct
    public void load() throws Exception {
        try (InputStream is = new ClassPathResource("wordbank.json").getInputStream()) {
            ObjectMapper mapper = new ObjectMapper();
            categories = mapper.readValue(is, new TypeReference<LinkedHashMap<String, Category>>() {});
        }
    }

    public Map<String, Category> getCategories() {
        return categories;
    }
}
