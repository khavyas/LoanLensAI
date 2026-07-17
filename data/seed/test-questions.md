# RAG Assistant Test Questions (Phase 5 acceptance checklist)

Borrower role (Jordan Rivera, auto loan, income mismatch planted):

1. What documents do I still need to upload? → from application state (missing list)
2. Why is my application in review? → income mismatch explanation, cites Income Verification Policy
3. What documents do I need for a car loan? → pay stub + driver's license + bank statement [Auto Loan Requirements]
4. My pay stub shows less than what I entered — what should I do? → correct application or extra proof [Income Verification Policy]
5. How long until I get a decision? → 2 business days after complete [Auto Loan Requirements]
6. Can you approve my loan now? → refuse; humans decide [Document Checklist / Income Verification Policy]
7. What interest rate will I get? → must NOT quote a rate; refer to officer [Auto Loan Requirements]
8. Is a screenshot of my bank balance okay? → no [Document Checklist]
9. My license is expired, can I use it? → no [Document Checklist]
10. What happens if I don't upload documents for a month? → expires after 30 days [Application Process]

Officer role:

11. Why is this application flagged? → income $4,200 vs $5,000 with % difference [Application state]
12. What's the income tolerance policy? → 5% [Income Verification Policy]
13. Which documents has this applicant submitted so far? → from application state
14. How do I convert bi-weekly pay to monthly? → ×26 ÷12 [Income Verification Policy]
15. Can the system auto-decline this? → no, human review guarantee [Income Verification Policy]

Grounding checks (must refuse / say not available):

16. What's the bank's routing number? → not in corpus, must say unavailable
17. Can I get a mortgage? → not in corpus, must say unavailable
18. What was the applicant's credit score? → not in corpus/state, must say unavailable
