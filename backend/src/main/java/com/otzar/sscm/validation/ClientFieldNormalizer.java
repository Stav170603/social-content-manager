package com.otzar.sscm.validation;

public final class ClientFieldNormalizer {
    private ClientFieldNormalizer() {}

    public static String normalizePhone(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        if (!trimmed.matches("[+0-9\\s-]*")) return trimmed;
        String compact = trimmed.replaceAll("[\\s-]", "");
        if (compact.startsWith("+9725")) return "0" + compact.substring(4);
        return compact;
    }

    public static String normalizeInstagramUsername(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        if (normalized.isEmpty()) return null;
        return normalized.startsWith("@") ? normalized.substring(1) : normalized;
    }

    public static String normalizeEmail(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }
}
