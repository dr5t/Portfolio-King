import subprocess
import re
import os

patterns = {
    "MongoDB Atlas URI": re.compile(r"mongodb\+srv://[^\s\"'\`]+"),
    "Private Key": re.compile(r"-----BEGIN[ A-Z_-]*PRIVATE KEY-----"),
    "AWS Access Key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "GitHub Token": re.compile(r"(ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{22,})"),
    "Slack Token": re.compile(r"xox[baprs]-[0-9a-zA-Z]{10,48}"),
    "Generic Private Secret Assignment": re.compile(r"(?:admin_password|jwt_secret|api_key|secret_key)\s*[:=]\s*['\"][^'\"\s]{6,}['\"]", re.IGNORECASE)
}

safe_placeholders = [
    "username:password", "your_admin_username", "replace_with", 
    "change_this", "<username>", "<password>", "admin@1234", "portfolio_king"
]

tracked_files = subprocess.check_output(["git", "ls-files"]).decode("utf-8").splitlines()
findings = []

for filepath in tracked_files:
    if filepath.endswith((".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".pdf")):
        continue
    if not os.path.exists(filepath):
        continue
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line_no, line in enumerate(f, 1):
                for p_name, p_regex in patterns.items():
                    m = p_regex.search(line)
                    if m:
                        val = m.group(0)
                        if any(sp in val for sp in safe_placeholders):
                            continue
                        findings.append({
                            "type": p_name,
                            "file": filepath,
                            "line": line_no
                        })
    except Exception as e:
        pass

print(f"Total tracked files scanned: {len(tracked_files)}")
print(f"Total findings in tracked files: {len(findings)}")
for item in findings:
    print(f"  [FLAGGED] {item['type']} in {item['file']}:{item['line']}")
