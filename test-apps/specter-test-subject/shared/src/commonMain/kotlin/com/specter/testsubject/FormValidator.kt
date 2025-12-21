package com.specter.testsubject

/**
 * Form validation logic - testable input validation for KMM
 */
data class ValidationResult(
    val isValid: Boolean,
    val errorMessage: String? = null
)

class FormValidator {

    fun validateEmail(email: String): ValidationResult {
        if (email.isBlank()) {
            return ValidationResult(false, "Email is required")
        }

        val emailRegex = Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")
        if (!emailRegex.matches(email)) {
            return ValidationResult(false, "Invalid email format")
        }

        return ValidationResult(true)
    }

    fun validatePassword(password: String): ValidationResult {
        if (password.isBlank()) {
            return ValidationResult(false, "Password is required")
        }

        if (password.length < 8) {
            return ValidationResult(false, "Password must be at least 8 characters")
        }

        if (!password.any { it.isDigit() }) {
            return ValidationResult(false, "Password must contain at least one digit")
        }

        if (!password.any { it.isUpperCase() }) {
            return ValidationResult(false, "Password must contain at least one uppercase letter")
        }

        return ValidationResult(true)
    }

    fun validateUsername(username: String): ValidationResult {
        if (username.isBlank()) {
            return ValidationResult(false, "Username is required")
        }

        if (username.length < 3) {
            return ValidationResult(false, "Username must be at least 3 characters")
        }

        if (username.length > 20) {
            return ValidationResult(false, "Username must be at most 20 characters")
        }

        val usernameRegex = Regex("^[a-zA-Z0-9_]+$")
        if (!usernameRegex.matches(username)) {
            return ValidationResult(false, "Username can only contain letters, numbers, and underscores")
        }

        return ValidationResult(true)
    }

    fun validateForm(email: String, username: String, password: String): Map<String, ValidationResult> {
        return mapOf(
            "email" to validateEmail(email),
            "username" to validateUsername(username),
            "password" to validatePassword(password)
        )
    }

    fun isFormValid(email: String, username: String, password: String): Boolean {
        return validateForm(email, username, password).values.all { it.isValid }
    }
}
