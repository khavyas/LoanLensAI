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

Small business scenario (Dana Whitfield, Whitfield & Co. Bakery LLC — revenue mismatch + business name mismatch both planted):

19. What documents do I need for a small business loan? → tax returns, personal financial statement, business license, ownership disclosure [Small Business Loan Requirements]
20. Why is my business loan application flagged? → business name mismatch ("Whitfield & Co. Bakery LLC" vs "Whitfield And Co Bakery LLC") and revenue mismatch ($340,000 stated vs $275,400 documented) [Application state / Small Business Loan Requirements]
21. Why does the legal name on my license need to match my application exactly? → entity name matching policy, common cause of closing delays [Small Business Loan Requirements]
22. How much ownership do I need to disclose? → 25% or more, with exact percentage [Small Business Loan Requirements]
23. How long until I get a decision on my business loan? → 5 business days after all 4 docs verified, clock pauses on unresolved exceptions [Small Business Loan Requirements]

Grounding checks (must refuse / say not available):

16. What's the bank's routing number? → not in corpus, must say unavailable
17. Can I get a mortgage? → not in corpus, must say unavailable
18. What was the applicant's credit score? → not in corpus/state, must say unavailable
