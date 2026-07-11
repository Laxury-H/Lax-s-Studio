import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";

async function generateCommitMessage(diff) {
  if (!NVIDIA_API_KEY) {
    console.warn("⚠️  NVIDIA_API_KEY not found in .env. Falling back to default message.");
    return "auto: updates and minor fixes";
  }

  // Truncate diff if it's too long
  const maxDiffLength = 8000;
  const truncatedDiff = diff.length > maxDiffLength ? diff.slice(0, maxDiffLength) + "\n... [diff truncated]" : diff;

  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          {
            role: "system",
            content: "You are an expert developer. Generate a clean, conventional git commit message based on the provided diff. " +
                     "Format rules:\n" +
                     "1. First line: A short summary (max 50 chars), preferably using conventional commits format (e.g., 'feat: add filter', 'fix: resolve render build error').\n" +
                     "2. Body: Leave a blank line, then list important details about what changed and why as bullet points.\n" +
                     "3. Output ONLY the raw commit message text. Do NOT wrap in markdown code blocks or quotes."
          },
          {
            role: "user",
            content: `Here is the git diff:\n\n${truncatedDiff}`
          }
        ],
        temperature: 0.2,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API responded with status ${response.status}`);
    }

    const data = await response.json();
    const commitMsg = data.choices?.[0]?.message?.content?.trim();
    if (commitMsg) {
      return commitMsg;
    }
  } catch (error) {
    console.error("❌ Error generating commit message via NVIDIA AI:", error.message);
  }

  return "auto: updates and bug fixes";
}

async function run() {
  try {
    console.log("🔍 Checking git status...");
    const status = execSync("git status --porcelain").toString().trim();
    if (!status) {
      console.log("✅ No changes detected. Nothing to push.");
      return;
    }

    console.log("➕ Staging all changes (git add .)...");
    execSync("git add .");

    console.log("📝 Generating diff for AI review...");
    const diff = execSync("git diff --cached").toString().trim();
    if (!diff) {
      console.log("⚠️  Diff is empty. Nothing to commit.");
      return;
    }

    console.log("🤖 Asking AI to generate commit message...");
    const commitMessage = await generateCommitMessage(diff);
    console.log("\n--------------------------");
    console.log("📝 Generated Commit Message:\n");
    console.log(commitMessage);
    console.log("--------------------------\n");

    // Write commit message to a temp file to handle multi-line strings easily in bash/cmd
    const tempFile = path.join(process.cwd(), ".git-commit-msg-temp.txt");
    fs.writeFileSync(tempFile, commitMessage, "utf8");

    console.log("💾 Committing changes...");
    execSync(`git commit -F "${tempFile}"`);
    fs.unlinkSync(tempFile);

    console.log("🚀 Pushing to remote repository...");
    const pushOutput = execSync("git push").toString();
    console.log(pushOutput);
    console.log("🎉 Done! Successfully committed and pushed.");

  } catch (error) {
    console.error("❌ Execution failed:", error.message);
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
  }
}

run();
