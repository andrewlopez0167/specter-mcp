plugins {
    // Kotlin Multiplatform
    kotlin("multiplatform").version("1.9.22").apply(false)
    kotlin("android").version("1.9.22").apply(false)

    // Android
    id("com.android.application").version("8.2.2").apply(false)
    id("com.android.library").version("8.2.2").apply(false)

    // Compose
    id("org.jetbrains.compose").version("1.5.12").apply(false)
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
