package com.specter.testsubject.android

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.specter.testsubject.Counter
import com.specter.testsubject.FormValidator
import com.specter.testsubject.getGreeting

class MainActivity : ComponentActivity() {
    companion object {
        private const val TAG = "SpecterTestSubject"
        const val PREFS_NAME = "specter_prefs"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.i(TAG, "MainActivity created")

        // Initialize preferences with default values for testing
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.contains("app_initialized")) {
            prefs.edit()
                .putBoolean("app_initialized", true)
                .putString("app_version", "1.0.0")
                .putLong("first_launch_time", System.currentTimeMillis())
                .apply()
            Log.i(TAG, "Preferences initialized")
        }

        setContent {
            SpecterTestSubjectTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen()
                }
            }
        }
    }
}

@Composable
fun MainScreen() {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Counter", "Form", "Debug")

    Column(modifier = Modifier.fillMaxSize()) {
        TabRow(
            selectedTabIndex = selectedTab,
            modifier = Modifier.testTag("tab_row")
        ) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) },
                    modifier = Modifier.testTag("tab_$title")
                )
            }
        }

        when (selectedTab) {
            0 -> CounterScreen()
            1 -> FormScreen()
            2 -> DebugScreen()
        }
    }
}

@Composable
fun CounterScreen() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE) }
    val counter = remember { Counter(prefs.getInt("counter_value", 0)) }
    var counterValue by remember { mutableStateOf(counter.value) }

    fun saveCounter() {
        prefs.edit().putInt("counter_value", counter.value).apply()
        prefs.edit().putLong("last_updated", System.currentTimeMillis()).apply()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Specter Counter",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.testTag("counter_title")
        )

        Spacer(modifier = Modifier.height(48.dp))

        Text(
            text = counterValue.toString(),
            fontSize = 72.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag("counter_value")
        )

        Spacer(modifier = Modifier.height(32.dp))

        Text(
            text = getGreeting(counter),
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag("counter_greeting")
        )

        Spacer(modifier = Modifier.height(48.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(
                onClick = {
                    counterValue = counter.decrement()
                    saveCounter()
                    Log.d("SpecterTestSubject", "Decremented to $counterValue")
                },
                modifier = Modifier
                    .size(80.dp)
                    .testTag("btn_decrement")
            ) {
                Text("-", fontSize = 32.sp)
            }

            OutlinedButton(
                onClick = {
                    counter.reset()
                    counterValue = counter.value
                    saveCounter()
                    Log.d("SpecterTestSubject", "Reset to $counterValue")
                },
                modifier = Modifier
                    .height(80.dp)
                    .testTag("btn_reset")
            ) {
                Text("Reset", fontSize = 16.sp)
            }

            Button(
                onClick = {
                    counterValue = counter.increment()
                    saveCounter()
                    Log.d("SpecterTestSubject", "Incremented to $counterValue")
                },
                modifier = Modifier
                    .size(80.dp)
                    .testTag("btn_increment")
            ) {
                Text("+", fontSize = 32.sp)
            }
        }
    }
}

@Composable
fun FormScreen() {
    val validator = remember { FormValidator() }

    var email by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    var emailError by remember { mutableStateOf<String?>(null) }
    var usernameError by remember { mutableStateOf<String?>(null) }
    var passwordError by remember { mutableStateOf<String?>(null) }

    var formSubmitted by remember { mutableStateOf(false) }
    var formValid by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        Text(
            text = "Registration Form",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.testTag("form_title")
        )

        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = email,
            onValueChange = {
                email = it
                emailError = null
            },
            label = { Text("Email") },
            isError = emailError != null,
            supportingText = { emailError?.let { Text(it) } },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("input_email"),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = username,
            onValueChange = {
                username = it
                usernameError = null
            },
            label = { Text("Username") },
            isError = usernameError != null,
            supportingText = { usernameError?.let { Text(it) } },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("input_username"),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = password,
            onValueChange = {
                password = it
                passwordError = null
            },
            label = { Text("Password") },
            isError = passwordError != null,
            supportingText = { passwordError?.let { Text(it) } },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("input_password"),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = {
                val results = validator.validateForm(email, username, password)
                emailError = results["email"]?.errorMessage
                usernameError = results["username"]?.errorMessage
                passwordError = results["password"]?.errorMessage
                formValid = results.values.all { it.isValid }
                formSubmitted = true
                Log.d("SpecterTestSubject", "Form submitted: valid=$formValid")
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .testTag("btn_submit")
        ) {
            Text("Submit", fontSize = 18.sp)
        }

        if (formSubmitted) {
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = if (formValid) "Form submitted successfully!" else "Please fix the errors above",
                color = if (formValid) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                modifier = Modifier.testTag("form_result")
            )
        }
    }
}

@Composable
fun DebugScreen() {
    val context = LocalContext.current
    var logMessage by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        Text(
            text = "Debug & Crash Testing",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.testTag("debug_title")
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = "Log Testing (inspect_logs)",
            style = MaterialTheme.typography.titleMedium
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = logMessage,
            onValueChange = { logMessage = it },
            label = { Text("Log message") },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("input_log_message"),
            singleLine = true
        )

        Spacer(modifier = Modifier.height(8.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            Button(
                onClick = {
                    Log.v("SpecterTestSubject", "VERBOSE: $logMessage")
                },
                modifier = Modifier.testTag("btn_log_verbose")
            ) {
                Text("V", fontSize = 12.sp)
            }
            Button(
                onClick = {
                    Log.d("SpecterTestSubject", "DEBUG: $logMessage")
                },
                modifier = Modifier.testTag("btn_log_debug")
            ) {
                Text("D", fontSize = 12.sp)
            }
            Button(
                onClick = {
                    Log.i("SpecterTestSubject", "INFO: $logMessage")
                },
                modifier = Modifier.testTag("btn_log_info")
            ) {
                Text("I", fontSize = 12.sp)
            }
            Button(
                onClick = {
                    Log.w("SpecterTestSubject", "WARNING: $logMessage")
                },
                modifier = Modifier.testTag("btn_log_warn")
            ) {
                Text("W", fontSize = 12.sp)
            }
            Button(
                onClick = {
                    Log.e("SpecterTestSubject", "ERROR: $logMessage")
                },
                modifier = Modifier.testTag("btn_log_error")
            ) {
                Text("E", fontSize = 12.sp)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Exception Testing (analyze_crash)",
            style = MaterialTheme.typography.titleMedium
        )

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                try {
                    throw IllegalStateException("Test caught exception from SpecterTestSubject")
                } catch (e: Exception) {
                    Log.e("SpecterTestSubject", "Caught exception: ${e.message}", e)
                }
            },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("btn_caught_exception")
        ) {
            Text("Trigger Caught Exception (logs only)")
        }

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                Log.e("SpecterTestSubject", "About to throw uncaught NullPointerException!")
                val nullString: String? = null
                nullString!!.length // This will crash the app
            },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("btn_null_crash")
        ) {
            Text("Trigger NullPointerException (CRASH)")
        }

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                Log.e("SpecterTestSubject", "About to throw ArrayIndexOutOfBoundsException!")
                val array = intArrayOf(1, 2, 3)
                @Suppress("UNUSED_VARIABLE")
                val value = array[10] // This will crash the app
            },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("btn_array_crash")
        ) {
            Text("Trigger ArrayIndexOutOfBounds (CRASH)")
        }

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                Log.e("SpecterTestSubject", "About to throw RuntimeException!")
                throw RuntimeException("Intentional test crash from SpecterTestSubject Debug tab")
            },
            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
            modifier = Modifier
                .fillMaxWidth()
                .testTag("btn_runtime_crash")
        ) {
            Text("Trigger RuntimeException (CRASH)")
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "State Testing (inspect_app_state)",
            style = MaterialTheme.typography.titleMedium
        )

        Spacer(modifier = Modifier.height(8.dp))

        Button(
            onClick = {
                val prefs = context.getSharedPreferences(MainActivity.PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit()
                    .putString("debug_test_key", "test_value_${System.currentTimeMillis()}")
                    .putInt("debug_test_count", prefs.getInt("debug_test_count", 0) + 1)
                    .apply()
                Log.i("SpecterTestSubject", "Debug values written to SharedPreferences")
            },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("btn_write_prefs")
        ) {
            Text("Write Debug Values to SharedPreferences")
        }
    }
}

@Composable
fun SpecterTestSubjectTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(),
        content = content
    )
}
