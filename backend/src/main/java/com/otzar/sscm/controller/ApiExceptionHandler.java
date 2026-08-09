package com.otzar.sscm.controller;

import com.otzar.sscm.models.ApiResponse;
import com.otzar.sscm.models.ValidationErrorResponse;
import com.otzar.sscm.service.InstagramPublishException;
import com.otzar.sscm.service.InstagramInsightsException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import com.otzar.sscm.service.ContentDeletionBlockedException;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ContentDeletionBlockedException.class)
    public ResponseEntity<Map<String, Object>> handleContentDeletionBlocked(ContentDeletionBlockedException exception) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("code", "CONTENT_HAS_PUBLICATION_HISTORY");
        body.put("message", exception.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleContentPersistence(DataIntegrityViolationException exception) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("code", "CONTENT_SAVE_FAILED");
        body.put("message", "Content could not be saved. Please verify the media and try again.");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("code", "INVALID_REQUEST_PARAMETER");
        body.put("message", "Invalid value for query parameter: " + exception.getName());
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(InstagramInsightsException.class)
    public ResponseEntity<Map<String, Object>> handleInstagramInsights(InstagramInsightsException exception) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("code", exception.getCode());
        body.put("message", exception.getMessage());
        return ResponseEntity.status(exception.getStatus()).body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
        return validationResponse(fieldErrors(exception.getBindingResult().getFieldErrors()));
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<ValidationErrorResponse> handleBinding(BindException exception) {
        return validationResponse(fieldErrors(exception.getBindingResult().getFieldErrors()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ValidationErrorResponse> handleUnreadableBody(HttpMessageNotReadableException exception) {
        return validationResponse(Collections.emptyMap());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse> handleUnsupportedMediaType(
            HttpMediaTypeNotSupportedException exception) {
        String receivedType = exception.getContentType() == null
                ? "missing Content-Type"
                : exception.getContentType().toString();

        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(new ApiResponse(false,
                        "Unsupported media type: " + receivedType
                                + ". Use multipart/form-data for file uploads."));
    }

    @ExceptionHandler(InstagramPublishException.class)
    public ResponseEntity<ApiResponse> handleInstagramPublish(InstagramPublishException exception) {
        HttpStatus status;
        switch (exception.getReason()) {
            case CONTENT_NOT_FOUND:
                status = HttpStatus.NOT_FOUND;
                break;
            case NOT_CONFIGURED:
                status = HttpStatus.SERVICE_UNAVAILABLE;
                break;
            case META_API_FAILURE:
                status = HttpStatus.BAD_GATEWAY;
                break;
            default:
                status = HttpStatus.BAD_REQUEST;
        }
        return ResponseEntity.status(status).body(new ApiResponse(false, exception.getMessage()));
    }

    private Map<String, String> fieldErrors(java.util.List<FieldError> errors) {
        Map<String, String> messages = new LinkedHashMap<>();
        errors.forEach(error -> messages.putIfAbsent(error.getField(),
                error.isBindingFailure() ? "Invalid value" : error.getDefaultMessage()));
        return messages;
    }

    private ResponseEntity<ValidationErrorResponse> validationResponse(Map<String, String> fieldErrors) {
        return ResponseEntity.badRequest().body(
                new ValidationErrorResponse(400, "Validation failed", fieldErrors));
    }
}
