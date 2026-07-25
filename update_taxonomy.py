import json
import os

labs = [
    # Image 1
    ("Advanced Static Malware Analysis Using PEStudio", "Medium", "malware_re"),
    ("Anti-Analysis Lab", "Medium", "malware_re"),
    ("Apache Access Combined Log Analysis", "Easy", "soc_siem"),
    ("API & Modern Application Security - Foundations", "Easy", "web_security"),
    ("API Monitoring", "Medium", "malware_re"),
    ("Behavior Monitoring", "Medium", "malware_re"),
    ("Binary Lore The Forensic Stringer", "Medium", "dfir"),
    ("Broken Authentication", "Easy", "web_security"),
    ("Broken Authentication - Identity and Session Failures", "Easy", "web_security"),
    ("Broken Authentication 2", "Medium", "web_security"),
    ("CIDR & Subnetting Basics", "Easy", "network_security"),
    ("Command Injection", "Easy", "web_security"),
    # Image 2
    ("Data Carving and File Recovery", "Easy", "dfir"),
    ("Deceptive Delivery", "Easy", "malware_re"),
    ("Different Types of Logs in SIEM and Their Log Formats", "Easy", "soc_siem"),
    ("Echo in Memory: The Outbound Anomaly", "Easy", "network_security"),
    ("Echoes of the Secret", "Medium", "dfir"),
    ("Encoded Whispers", "Easy", "dfir"),
    ("File Structure Lab", "Medium", "malware_re"),
    ("Files & Directories Management", "Easy", "dfir"),
    ("Foundations & Attacker Mindset", "Easy", "network_security"),
    ("Fundamentals of Internet Protocol", "Easy", "network_security"),
    ("Github Recon", "Easy", "threat_hunting"),
    ("Google Dorking", "Easy", "web_security"),
    # Image 3
    ("Hidden in Plain Sight", "Medium", "dfir"),
    ("Host Based Incident Response", "Easy", "dfir"),
    ("HTTP Basics Deep Dive", "Easy", "network_security"),
    ("Input / Output Handling", "Easy", "network_security"),
    ("Insecure Direct Object Reference (IDOR)", "Medium", "web_security"),
    ("Insecure Direct Object Reference (IDOR) - Broken Object Level...", "Easy", "web_security"),
    ("Introduction to Computer Networks", "Easy", "network_security"),
    ("Introduction to Linux, GNU and Interfaces", "Easy", "network_security"),
    ("Introduction to Static Malware Analysis", "Easy", "malware_re"),
    ("Introduction to the OSI Model", "Easy", "network_security"),
    ("Introduction to Threat Modelling", "Easy", "threat_hunting"),
    ("Kali Linux Setup Walkthrough", "Info", "network_security"),
    ("Links in Linux", "Easy", "network_security"),
    ("Linux Distributions and Comparison", "Easy", "network_security"),
    ("Linux File Systems Basics", "Easy", "network_security"),
    ("Linux Live Analysis", "Easy", "dfir"),
    # Image 4
    ("Linux Permissions", "Easy", "network_security"),
    ("Live Container Analysis", "Medium", "threat_hunting"),
    ("Log Pivoting", "Hard", "soc_siem"),
    ("Memory Hunter", "Hard", "dfir"),
    ("Meta Data Trail", "Medium", "dfir"),
    ("Midnight Notes", "Easy", "dfir"),
    ("Missing Examination File", "Easy", "dfir"),
    ("NAT Concepts", "Easy", "network_security"),
    ("Notepad++ Compromise Investigation", "Hard", "soc_siem"),
    ("Obfuscation Lab", "Medium", "malware_re"),
    ("Pentesting basics", "Easy", "web_security"),
    ("Persistence in the Shadows", "Hard", "threat_hunting"),
    ("Phantom Ledger", "Hard", "threat_hunting"),
    ("Privilege Escalation", "Medium", "threat_hunting"),
    ("Process Injection Analysis", "Medium", "malware_re"),
    ("QuickClean Runtime Investigation", "Medium", "threat_hunting"),
    ("Race Condition Bypass", "Hard", "web_security"),
    ("Reconnaissance", "Easy", "web_security"),
    ("Sandbox Analysis", "Medium", "malware_re"),
    ("Server Side Template Injection", "Easy", "web_security"),
]

def generate_skills():
    skills = []
    for i, (title, difficulty, domain) in enumerate(labs, start=1):
        if difficulty == "Easy" or difficulty == "Info":
            est_hours = 2.0
            difficulty_normalized = "Beginner"
        elif difficulty == "Medium":
            est_hours = 4.0
            difficulty_normalized = "Intermediate"
        elif difficulty == "Hard":
            est_hours = 6.0
            difficulty_normalized = "Advanced"
        else:
            est_hours = 3.0
            difficulty_normalized = "Intermediate"

        keywords = []
        if domain == "web_security":
            keywords = ["web", "api", "injection", "authentication", "xss", "idor"]
        elif domain == "network_security":
            keywords = ["network", "linux", "protocol", "http", "ip", "subnetting"]
        elif domain == "dfir":
            keywords = ["forensics", "investigation", "memory", "file system", "recovery"]
        elif domain == "soc_siem":
            keywords = ["log", "siem", "analysis", "splunk", "elastic", "investigation"]
        elif domain == "threat_hunting":
            keywords = ["hunting", "recon", "container", "privilege escalation"]
        elif domain == "malware_re":
            keywords = ["malware", "static analysis", "behavior", "injection", "obfuscation", "sandbox"]

        skill_name = title.split("-")[0].split("(")[0].strip()

        skills.append({
            "skill_id": f"{domain.upper()}-{i:03d}",
            "name": skill_name,
            "domain": domain,
            "lab_id": f"PWN-{domain[:3].upper()}-{i:03d}",
            "lab_title": title,
            "difficulty": difficulty_normalized,
            "est_hours": est_hours,
            "weight": 1.0,
            "description": f"Learn about {skill_name} in this highly interactive PWNDORA cybersecurity lab environment. Expand your skillset in {domain.replace('_', ' ').title()}.",
            "keywords": keywords + [word.lower() for word in skill_name.split() if len(word) > 3]
        })
    return skills

def main():
    path = os.path.join(os.path.dirname(__file__), "backend", "app", "data", "taxonomy.json")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    data["skills"] = generate_skills()
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print("Taxonomy updated with 60 labs.")

if __name__ == "__main__":
    main()
