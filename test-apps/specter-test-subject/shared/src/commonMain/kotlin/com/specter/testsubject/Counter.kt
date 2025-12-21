package com.specter.testsubject

/**
 * Shared Counter logic - testable business logic for KMM
 */
class Counter(initialValue: Int = 0) {
    private var _value: Int = initialValue

    val value: Int
        get() = _value

    fun increment(): Int {
        _value++
        return _value
    }

    fun decrement(): Int {
        _value--
        return _value
    }

    fun reset() {
        _value = 0
    }

    fun setValue(newValue: Int) {
        _value = newValue
    }

    companion object {
        const val MAX_VALUE = 999
        const val MIN_VALUE = -999
    }
}
