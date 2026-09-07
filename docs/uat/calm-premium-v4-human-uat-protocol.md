# SARAFI Calm Premium v4 human UAT protocol

Candidate commit: `b325812e1b8238ba1fcdefd00e913f06f473b7b8`

Use the companion workbook at `outputs/01a06de4-7b78-7e23-b83f-0dc21d6bb900/SARAFI_Calm_Premium_v4_UAT.xlsx`. It calculates the brief's participant coverage, task thresholds, language sign-off, remaining gates, and release decision. Empty human evidence correctly produces **No ship**.

## Environment

Run UAT against a safe preview built from the exact candidate commit.

- Apply `20260906190754_calm_premium_capabilities.sql` to the preview database.
- Use synthetic counterparties, amounts, Hawala references, and debts.
- Prepare separate Owner, Business Administrator, Manager, Accountant, Cashier, Compliance Officer, Viewer, and unconnected-worker accounts.
- Assign realistic branch, cashbox, capability, limit, and MFA policies.
- Run the authenticated Business Administrator suite before inviting participants.
- Record the preview URL, facilitator, and test dates in **Release Summary**.

Do not test unreleased workflows against production customer or financial data.

## Participants

Minimum coverage:

- two Sarafi owners;
- one Business Administrator;
- one branch manager;
- two experienced cashiers;
- one accountant;
- one compliance employee;
- one viewer;
- two first-time non-accountant users;
- at least one native Afghan Dari reviewer and one native Pashto reviewer.

A participant may fill a native-language reviewer role only when they are competent to approve natural financial terminology. Record anonymous IDs, experience, native language, first-time status, review assignment, consent, and planned session count in **Participants**.

## Facilitation rules

1. Start each task from the stated starting point with the expected role already signed in.
2. Read the task exactly. Do not explain navigation, Buy/Sell meaning, rates, base currency, journals, UUIDs, or account selection.
3. Start timing when the participant sees the role Home primary action.
4. Stop when the form is ready for review or the requested operational destination is loaded.
5. If the participant needs coaching, record the task as unsuccessful and document the confusion before helping.
6. Preserve every original observation. Record reruns as new rows.
7. Use an evidence link or session reference without storing personal identifiers.

## Required journeys

| Journey | Primary participant | Required observation |
|---|---|---|
| Find the primary Home action | First-time user | Correct action identified within five seconds |
| Buy currency | Cashier | Amount entry begins within two taps; ordinary task under 25 seconds; advanced rate controls remain hidden |
| Sell currency | Cashier | Same timing and disclosure rule as Buy |
| Receive customer money | Cashier | Completed unassisted without visiting Rates |
| Send Hawala | Cashier | Direct task, no raw partner UUID, completed unassisted |
| Settle debt | Manager | Direct debt selection and settlement in one place |
| Review an approval | Owner or Manager | Correct decision destination reached without feature-directory searching |
| Open Daily Summary | Accountant | Read-only daily work starts from the primary Home action |
| Review a compliance case | Compliance Officer | Case review reached without posting controls |
| Request business access | First-time worker | Request ends in a pending lobby, not immediate membership activation |

For Buy and Sell, ask the participant before confirmation to explain which currency the shop receives and which currency the shop gives. Mark any reversed shop perspective as a critical misunderstanding.

## Recording

Enter one row per task in **Task Sessions**.

- **Daily journey** is Yes only for Buy, Sell, Receive customer money, Send Hawala, and Settle debt.
- **Unassisted success** is No if the facilitator gives task-specific guidance.
- **Completion seconds** is elapsed time from the defined start to finish.
- **Home action within 5s** is Yes or No only when that observation applies; otherwise use NA.
- Record whether the participant visited Rates, asked about a technical term, misunderstood Buy/Sell, or could see/invoke a forbidden operation.
- Ease uses 1 for very difficult through 5 for very easy.
- Write the participant's confusion in plain language. Do not reinterpret it into product terminology.

## Native-language review

Use **Language Review** for Afghan Dari and Pashto. Review Home, transaction entry, Buy, Sell, Receive, Hawala, debt settlement, Reports, Manage SARAFI, and important error messages.

For each item, record:

- accuracy of meaning;
- natural financial wording;
- RTL direction and LTR isolation of amounts, codes, and currency pairs;
- severity and suggested replacement where needed;
- Approved or Change required.

After all issues are resolved, each native reviewer adds a separate row with scope **Final sign-off** and decision **Approved**.

## Acceptance thresholds

The release gate passes only when all are true:

- at least 90% unassisted success across the five daily journeys;
- median ordinary Buy/Sell completion is 25 seconds or less;
- no participant visits Rates before an ordinary transaction;
- no participant needs UUID, base amount, or journal-account explanations;
- at least 90% identify the primary Home action within five seconds;
- no critical shop-perspective Buy/Sell misunderstanding;
- no role sees or invokes a forbidden operation;
- average ease is at least 4.3 out of 5 for the five daily journeys;
- every required persona and both native reviewers are represented;
- Dari and Pashto final sign-offs are recorded;
- every release control in the workbook is Yes.

If any threshold fails or has no evidence, the decision remains **No ship**. The facilitator must link the defect, preserve the failed observation, verify the correction, and add a new rerun row.
