package apperr

import "net/http"

type AppError struct {
	Status  int
	Code    string
	Message string
	Err     error
}

func (e *AppError) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Message
}

func New(status int, code, message string, err error) *AppError {
	return &AppError{
		Status:  status,
		Code:    code,
		Message: message,
		Err:     err,
	}
}

func BadRequest(message string) *AppError {
	return New(http.StatusBadRequest, "BAD_REQUEST", message, nil)
}

func Unauthorized(message string) *AppError {
	return New(http.StatusUnauthorized, "UNAUTHORIZED", message, nil)
}

func Forbidden(message string) *AppError {
	return New(http.StatusForbidden, "FORBIDDEN", message, nil)
}

func NotFound(message string) *AppError {
	return New(http.StatusNotFound, "NOT_FOUND", message, nil)
}

func Conflict(message string) *AppError {
	return New(http.StatusConflict, "CONFLICT", message, nil)
}

func Internal(err error) *AppError {
	return New(
		http.StatusInternalServerError,
		"INTERNAL_ERROR",
		"Internal server error",
		err,
	)
}
