package com.specter.testsubject

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FormValidatorTest {
    private val validator = FormValidator()

    // Email validation tests
    @Test
    fun testValidEmail() {
        val result = validator.validateEmail("user@example.com")
        assertTrue(result.isValid)
        assertNull(result.errorMessage)
    }

    @Test
    fun testEmptyEmail() {
        val result = validator.validateEmail("")
        assertFalse(result.isValid)
        assertEquals("Email is required", result.errorMessage)
    }

    @Test
    fun testInvalidEmailFormat() {
        val result = validator.validateEmail("invalid-email")
        assertFalse(result.isValid)
        assertEquals("Invalid email format", result.errorMessage)
    }

    @Test
    fun testEmailMissingAtSign() {
        val result = validator.validateEmail("userexample.com")
        assertFalse(result.isValid)
    }

    // Password validation tests
    @Test
    fun testValidPassword() {
        val result = validator.validatePassword("Password1")
        assertTrue(result.isValid)
    }

    @Test
    fun testEmptyPassword() {
        val result = validator.validatePassword("")
        assertFalse(result.isValid)
        assertEquals("Password is required", result.errorMessage)
    }

    @Test
    fun testShortPassword() {
        val result = validator.validatePassword("Pass1")
        assertFalse(result.isValid)
        assertEquals("Password must be at least 8 characters", result.errorMessage)
    }

    @Test
    fun testPasswordNoDigit() {
        val result = validator.validatePassword("PasswordNoDigit")
        assertFalse(result.isValid)
        assertEquals("Password must contain at least one digit", result.errorMessage)
    }

    @Test
    fun testPasswordNoUppercase() {
        val result = validator.validatePassword("password1")
        assertFalse(result.isValid)
        assertEquals("Password must contain at least one uppercase letter", result.errorMessage)
    }

    // Username validation tests
    @Test
    fun testValidUsername() {
        val result = validator.validateUsername("john_doe123")
        assertTrue(result.isValid)
    }

    @Test
    fun testEmptyUsername() {
        val result = validator.validateUsername("")
        assertFalse(result.isValid)
        assertEquals("Username is required", result.errorMessage)
    }

    @Test
    fun testShortUsername() {
        val result = validator.validateUsername("ab")
        assertFalse(result.isValid)
        assertEquals("Username must be at least 3 characters", result.errorMessage)
    }

    @Test
    fun testLongUsername() {
        val result = validator.validateUsername("a".repeat(21))
        assertFalse(result.isValid)
        assertEquals("Username must be at most 20 characters", result.errorMessage)
    }

    @Test
    fun testUsernameWithSpecialChars() {
        val result = validator.validateUsername("user@name")
        assertFalse(result.isValid)
        assertEquals("Username can only contain letters, numbers, and underscores", result.errorMessage)
    }

    // Form validation tests
    @Test
    fun testValidForm() {
        assertTrue(validator.isFormValid(
            email = "user@example.com",
            username = "john_doe",
            password = "Password1"
        ))
    }

    @Test
    fun testInvalidForm() {
        assertFalse(validator.isFormValid(
            email = "invalid",
            username = "ab",
            password = "weak"
        ))
    }

    @Test
    fun testValidateFormReturnsAllResults() {
        val results = validator.validateForm(
            email = "user@example.com",
            username = "john_doe",
            password = "Password1"
        )
        assertEquals(3, results.size)
        assertTrue(results["email"]?.isValid == true)
        assertTrue(results["username"]?.isValid == true)
        assertTrue(results["password"]?.isValid == true)
    }
}
