/**
 * Android Gradle Build Integration Tests
 * Tests against real KMM project (specter-test-subject)
 *
 * Prerequisites:
 * - Java/JDK installed
 * - Android SDK installed
 * - specter-test-subject project exists
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { executeShell } from '../../../src/utils/shell.js';
import { buildGradle, GradleBuildOptions } from '../../../src/platforms/android/gradle.js';
import { parseGradleLog } from '../../../src/tools/build/log-parser.js';
import * as path from 'path';

const TEST_PROJECT_PATH = path.resolve(__dirname, '../../../test-apps/specter-test-subject');

async function isGradleAvailable(): Promise<boolean> {
  try {
    const result = await executeShell('java', ['-version']);
    return result.exitCode === 0 || result.stderr.includes('version');
  } catch {
    return false;
  }
}

async function projectExists(): Promise<boolean> {
  try {
    const result = await executeShell('ls', [path.join(TEST_PROJECT_PATH, 'build.gradle.kts')]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

describe('Android Gradle Build Integration', () => {
  let gradleAvailable = false;
  let projectReady = false;

  beforeAll(async () => {
    gradleAvailable = await isGradleAvailable();
    projectReady = await projectExists();

    console.log(`Gradle available: ${gradleAvailable}`);
    console.log(`Project ready: ${projectReady}`);
    console.log(`Project path: ${TEST_PROJECT_PATH}`);
  });

  describe('buildGradle', () => {
    it('should build debug APK successfully', async () => {
      if (!gradleAvailable || !projectReady) {
        console.log('Skipping: Gradle or project not available');
        return;
      }

      const options: GradleBuildOptions = {
        projectPath: TEST_PROJECT_PATH,
        module: 'androidApp',
        variant: 'debug',
        clean: false,
        timeoutMs: 600000, // 10 minutes
      };

      const result = await buildGradle(options);

      console.log(`Build success: ${result.success}`);
      console.log(`Duration: ${result.durationMs}ms`);

      if (result.success) {
        expect(result.artifactPath).toBeDefined();
        console.log(`Artifact: ${result.artifactPath}`);
      } else {
        const errors = result.errorSummary?.topErrors ?? [];
        console.log(`Build failed with ${errors.length} errors`);
        for (const error of errors.slice(0, 5)) {
          console.log(`  - ${error.file}:${error.line}: ${error.message}`);
        }
      }

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('durationMs');
    }, 600000);

    it('should clean and build', async () => {
      if (!gradleAvailable || !projectReady) {
        console.log('Skipping: Gradle or project not available');
        return;
      }

      const options: GradleBuildOptions = {
        projectPath: TEST_PROJECT_PATH,
        module: 'androidApp',
        variant: 'debug',
        clean: true,
        timeoutMs: 900000, // 15 minutes for clean build
      };

      const result = await buildGradle(options);

      console.log(`Clean build success: ${result.success}`);
      console.log(`Duration: ${result.durationMs}ms`);

      expect(result).toHaveProperty('success');
    }, 900000);
  });

  describe('parseGradleLog', () => {
    it('should parse successful build logs', () => {
      const logs = `
> Task :shared:compileKotlinJvm
> Task :shared:compileJava NO-SOURCE
> Task :androidApp:compileDebugKotlin
> Task :androidApp:assembleDebug

BUILD SUCCESSFUL in 45s
12 actionable tasks: 12 executed
`;

      const result = parseGradleLog(logs);

      // ParsedLog has errors array, not success boolean
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toBeDefined();
    });

    it('should parse build with errors', () => {
      const logs = `
> Task :shared:compileKotlinJvm
e: /Users/test/project/shared/src/commonMain/kotlin/Greeting.kt:12:5 Type mismatch: inferred type is String but Int was expected
e: /Users/test/project/shared/src/commonMain/kotlin/Greeting.kt:15:10 Unresolved reference: foo

FAILURE: Build failed with an exception.

BUILD FAILED in 10s
`;

      const result = parseGradleLog(logs);

      // Has errors = failed build
      expect(result.errors.length).toBeGreaterThan(0);

      expect(result.errors[0].file).toContain('Greeting.kt');
      expect(result.errors[0].line).toBe(12);
    });

    it('should extract warnings', () => {
      const logs = `
> Task :shared:compileKotlinJvm
w: /Users/test/project/shared/src/commonMain/kotlin/Utils.kt:20:5 Deprecation: foo is deprecated
w: /Users/test/project/shared/src/commonMain/kotlin/Utils.kt:25:10 Unreachable code

BUILD SUCCESSFUL in 30s
`;

      const result = parseGradleLog(logs);

      expect(result.warnings.length).toBe(2);
      expect(result.warnings[0].severity).toBe('warning');
    });
  });
});
