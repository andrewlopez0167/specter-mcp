package com.specter.testsubject

/**
 * Platform-agnostic greeting for testing purposes
 */
expect fun getPlatformName(): String

/**
 * Get greeting message with counter value
 */
fun getGreeting(counter: Counter): String {
    return "Counter value: ${counter.value} on ${getPlatformName()}"
}
