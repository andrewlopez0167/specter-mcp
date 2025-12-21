package com.specter.testsubject

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class CounterTest {

    @Test
    fun testInitialValue() {
        val counter = Counter()
        assertEquals(0, counter.value)
    }

    @Test
    fun testInitialValueCustom() {
        val counter = Counter(initialValue = 10)
        assertEquals(10, counter.value)
    }

    @Test
    fun testIncrement() {
        val counter = Counter()
        assertEquals(1, counter.increment())
        assertEquals(2, counter.increment())
        assertEquals(2, counter.value)
    }

    @Test
    fun testDecrement() {
        val counter = Counter(10)
        assertEquals(9, counter.decrement())
        assertEquals(8, counter.decrement())
        assertEquals(8, counter.value)
    }

    @Test
    fun testReset() {
        val counter = Counter(50)
        counter.reset()
        assertEquals(0, counter.value)
    }

    @Test
    fun testSetValue() {
        val counter = Counter()
        counter.setValue(100)
        assertEquals(100, counter.value)
    }

    @Test
    fun testNegativeValues() {
        val counter = Counter()
        counter.decrement()
        counter.decrement()
        assertEquals(-2, counter.value)
    }

    @Test
    fun testGreeting() {
        val counter = Counter(42)
        val greeting = getGreeting(counter)
        assertTrue(greeting.contains("42"))
        assertTrue(greeting.contains("Counter value"))
    }

    @Test
    fun testConstants() {
        assertEquals(999, Counter.MAX_VALUE)
        assertEquals(-999, Counter.MIN_VALUE)
    }
}
