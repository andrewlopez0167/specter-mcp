import SwiftUI

// MARK: - Counter Model with UserDefaults persistence
class Counter: ObservableObject {
    private let defaults = UserDefaults.standard
    private let counterKey = "counter_value"
    private let lastUpdatedKey = "last_updated"

    @Published var value: Int {
        didSet {
            defaults.set(value, forKey: counterKey)
            defaults.set(Date().timeIntervalSince1970, forKey: lastUpdatedKey)
        }
    }

    static let maxValue = 999
    static let minValue = -999

    init() {
        // Initialize app settings on first launch
        if !defaults.bool(forKey: "app_initialized") {
            defaults.set(true, forKey: "app_initialized")
            defaults.set("1.0.0", forKey: "app_version")
            defaults.set(Date().timeIntervalSince1970, forKey: "first_launch_time")
            print("SpecterTestSubject: UserDefaults initialized")
        }

        // Load persisted counter value
        self.value = defaults.integer(forKey: counterKey)
    }

    func increment() {
        value += 1
        print("SpecterTestSubject: Incremented to \(value)")
    }

    func decrement() {
        value -= 1
        print("SpecterTestSubject: Decremented to \(value)")
    }

    func reset() {
        value = 0
        print("SpecterTestSubject: Reset to \(value)")
    }
}

// MARK: - Form Validator
struct ValidationResult {
    let isValid: Bool
    let errorMessage: String?
}

class FormValidator {
    func validateEmail(_ email: String) -> ValidationResult {
        if email.isEmpty {
            return ValidationResult(isValid: false, errorMessage: "Email is required")
        }

        let emailRegex = "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        if !emailPredicate.evaluate(with: email) {
            return ValidationResult(isValid: false, errorMessage: "Invalid email format")
        }

        return ValidationResult(isValid: true, errorMessage: nil)
    }

    func validatePassword(_ password: String) -> ValidationResult {
        if password.isEmpty {
            return ValidationResult(isValid: false, errorMessage: "Password is required")
        }

        if password.count < 8 {
            return ValidationResult(isValid: false, errorMessage: "Password must be at least 8 characters")
        }

        if !password.contains(where: { $0.isNumber }) {
            return ValidationResult(isValid: false, errorMessage: "Password must contain at least one digit")
        }

        if !password.contains(where: { $0.isUppercase }) {
            return ValidationResult(isValid: false, errorMessage: "Password must contain at least one uppercase letter")
        }

        return ValidationResult(isValid: true, errorMessage: nil)
    }

    func validateUsername(_ username: String) -> ValidationResult {
        if username.isEmpty {
            return ValidationResult(isValid: false, errorMessage: "Username is required")
        }

        if username.count < 3 {
            return ValidationResult(isValid: false, errorMessage: "Username must be at least 3 characters")
        }

        if username.count > 20 {
            return ValidationResult(isValid: false, errorMessage: "Username must be at most 20 characters")
        }

        let usernameRegex = "^[a-zA-Z0-9_]+$"
        let usernamePredicate = NSPredicate(format: "SELF MATCHES %@", usernameRegex)
        if !usernamePredicate.evaluate(with: username) {
            return ValidationResult(isValid: false, errorMessage: "Username can only contain letters, numbers, and underscores")
        }

        return ValidationResult(isValid: true, errorMessage: nil)
    }
}

// MARK: - Main Content View
struct ContentView: View {
    var body: some View {
        TabView {
            CounterView()
                .tabItem {
                    Label("Counter", systemImage: "number")
                }
                .accessibilityIdentifier("tab_counter")

            FormView()
                .tabItem {
                    Label("Form", systemImage: "person.text.rectangle")
                }
                .accessibilityIdentifier("tab_form")

            DebugView()
                .tabItem {
                    Label("Debug", systemImage: "ladybug")
                }
                .accessibilityIdentifier("tab_debug")
        }
    }
}

// MARK: - Counter View
struct CounterView: View {
    @StateObject private var counter = Counter()

    var body: some View {
        VStack(spacing: 48) {
            Text("Specter Counter")
                .font(.largeTitle)
                .fontWeight(.bold)
                .accessibilityIdentifier("counter_title")

            Text("\(counter.value)")
                .font(.system(size: 72, weight: .bold))
                .accessibilityIdentifier("counter_value")

            Text("Counter value: \(counter.value) on iOS \(UIDevice.current.systemVersion)")
                .font(.body)
                .foregroundColor(.secondary)
                .accessibilityIdentifier("counter_greeting")

            HStack(spacing: 16) {
                Button(action: {
                    counter.decrement()
                }) {
                    Text("-")
                        .font(.system(size: 32, weight: .bold))
                        .frame(width: 80, height: 80)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .clipShape(Circle())
                }
                .accessibilityIdentifier("btn_decrement")

                Button(action: {
                    counter.reset()
                }) {
                    Text("Reset")
                        .font(.headline)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 16)
                        .background(Color.gray.opacity(0.2))
                        .foregroundColor(.primary)
                        .cornerRadius(8)
                }
                .accessibilityIdentifier("btn_reset")

                Button(action: {
                    counter.increment()
                }) {
                    Text("+")
                        .font(.system(size: 32, weight: .bold))
                        .frame(width: 80, height: 80)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .clipShape(Circle())
                }
                .accessibilityIdentifier("btn_increment")
            }
        }
        .padding()
    }
}

// MARK: - Form View
struct FormView: View {
    @State private var email = ""
    @State private var username = ""
    @State private var password = ""

    @State private var emailError: String?
    @State private var usernameError: String?
    @State private var passwordError: String?

    @State private var formSubmitted = false
    @State private var formValid = false

    private let validator = FormValidator()

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Text("Registration Form")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .accessibilityIdentifier("form_title")
                    .padding(.top, 32)

                VStack(alignment: .leading, spacing: 8) {
                    TextField("Email", text: $email)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.none)
                        .keyboardType(.emailAddress)
                        .accessibilityIdentifier("input_email")
                        .onChange(of: email) { _ in emailError = nil }

                    if let error = emailError {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                }
                .padding(.horizontal)

                VStack(alignment: .leading, spacing: 8) {
                    TextField("Username", text: $username)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .autocapitalization(.none)
                        .accessibilityIdentifier("input_username")
                        .onChange(of: username) { _ in usernameError = nil }

                    if let error = usernameError {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                }
                .padding(.horizontal)

                VStack(alignment: .leading, spacing: 8) {
                    SecureField("Password", text: $password)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .accessibilityIdentifier("input_password")
                        .onChange(of: password) { _ in passwordError = nil }

                    if let error = passwordError {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                }
                .padding(.horizontal)

                Button(action: submitForm) {
                    Text("Submit")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(10)
                }
                .padding(.horizontal)
                .accessibilityIdentifier("btn_submit")

                if formSubmitted {
                    Text(formValid ? "Form submitted successfully!" : "Please fix the errors above")
                        .foregroundColor(formValid ? .green : .red)
                        .accessibilityIdentifier("form_result")
                }

                Spacer()
            }
        }
    }

    private func submitForm() {
        let emailResult = validator.validateEmail(email)
        let usernameResult = validator.validateUsername(username)
        let passwordResult = validator.validatePassword(password)

        emailError = emailResult.errorMessage
        usernameError = usernameResult.errorMessage
        passwordError = passwordResult.errorMessage

        formValid = emailResult.isValid && usernameResult.isValid && passwordResult.isValid
        formSubmitted = true

        print("SpecterTestSubject: Form submitted, valid=\(formValid)")
    }
}

// MARK: - Debug View
struct DebugView: View {
    @State private var logMessage = ""
    private let defaults = UserDefaults.standard

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("Debug & Crash Testing")
                    .font(.title2)
                    .fontWeight(.bold)
                    .accessibilityIdentifier("debug_title")
                    .padding(.top, 24)

                // Log Testing Section
                VStack(spacing: 8) {
                    Text("Log Testing (inspect_logs)")
                        .font(.headline)

                    TextField("Log message", text: $logMessage)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .accessibilityIdentifier("input_log_message")
                        .padding(.horizontal)

                    HStack(spacing: 8) {
                        Button("V") {
                            print("SpecterTestSubject: VERBOSE - \(logMessage)")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("btn_log_verbose")

                        Button("D") {
                            print("SpecterTestSubject: DEBUG - \(logMessage)")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("btn_log_debug")

                        Button("I") {
                            print("SpecterTestSubject: INFO - \(logMessage)")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("btn_log_info")

                        Button("W") {
                            print("SpecterTestSubject: WARNING - \(logMessage)")
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("btn_log_warn")

                        Button("E") {
                            print("SpecterTestSubject: ERROR - \(logMessage)")
                        }
                        .buttonStyle(.bordered)
                        .tint(.red)
                        .accessibilityIdentifier("btn_log_error")
                    }
                }
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)
                .padding(.horizontal)

                // Exception Testing Section
                VStack(spacing: 8) {
                    Text("Exception Testing (analyze_crash)")
                        .font(.headline)

                    Button("Trigger Caught Exception (logs only)") {
                        // This simulates an error that's caught and logged
                        print("SpecterTestSubject: Caught exception - NSError domain test")
                        let error = NSError(domain: "SpecterTestSubject", code: 1001, userInfo: [
                            NSLocalizedDescriptionKey: "Test caught exception from Debug tab"
                        ])
                        print("SpecterTestSubject: Error details: \(error)")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange)
                    .accessibilityIdentifier("btn_caught_exception")

                    Button("Trigger Force Unwrap Crash (CRASH)") {
                        print("SpecterTestSubject: About to force unwrap nil!")
                        let optionalValue: String? = nil
                        _ = optionalValue!
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .accessibilityIdentifier("btn_nil_crash")

                    Button("Trigger Array Out of Bounds (CRASH)") {
                        print("SpecterTestSubject: About to access invalid array index!")
                        let array = [1, 2, 3]
                        _ = array[10]
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .accessibilityIdentifier("btn_array_crash")

                    Button("Trigger fatalError (CRASH)") {
                        print("SpecterTestSubject: About to call fatalError!")
                        fatalError("Intentional test crash from SpecterTestSubject Debug tab")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .accessibilityIdentifier("btn_fatal_crash")
                }
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)
                .padding(.horizontal)

                // State Testing Section
                VStack(spacing: 8) {
                    Text("State Testing (inspect_app_state)")
                        .font(.headline)

                    Button("Write Debug Values to UserDefaults") {
                        defaults.set("test_value_\(Int(Date().timeIntervalSince1970))", forKey: "debug_test_key")
                        defaults.set(defaults.integer(forKey: "debug_test_count") + 1, forKey: "debug_test_count")
                        print("SpecterTestSubject: Debug values written to UserDefaults")
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("btn_write_prefs")
                }
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(10)
                .padding(.horizontal)

                Spacer()
            }
        }
    }
}

// MARK: - Previews
struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}
