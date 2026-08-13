# 對 bot 說話 vs 順帶 @ 的辨識

## 現行方案（2026-08-13）：純規則 + 機率 + Cooldown

`@bot` 不再「只要有 @ 就回」。由 `src/services/directed-gate.ts` 依訊號打分數，再依分數採樣機率決定是否回應，並用 cooldown 防止頻繁觸發。

### 評分（`scoreMention`）
| 訊號 | 分數 |
|---|---|
| bot 提及在開頭第一個 token | +2 |
| bot 提及在句尾 且 是問句 | +2 |
| 引用回覆到 bot 的訊息 | +3 |
| 只有 bot 被 @（沒其他真人）| +1 |
| bot 提及在句中（第三人稱）| -1 |
| 同時 @ 多個真人 | -1 |
| 陳述句、非開頭提及、非引用 | -0.5 |

### 採樣機率（`shouldRespond`）
- `score >= 3`（明確點名）→ **一定回**（不會偶爾漏掉）
- `0 <= score < 3` → 0.40（模糊，偶爾回）
- `score < 0` → 0.12（順帶提及，偶爾湊熱鬧、像真人）

「陳述句」不算「明確對 bot 說話」，落在低機率層。

### Cooldown（`cooldownAllowed` / `consumeCooldown`）
- 每 channel 30s、每 user 20s。接龍與一般聊天共用。
- 只在**真正回應時**才消耗 cooldown（未回應不占額度，避免連續 @ 被誤擋）。

### 接龍（`maybeChain`）
- 已併入此門控：即使 `@bot` 貼捏他，也要「分數 + 機率 + cooldown」都過才接龍。

### 參數
`src/config.ts` → `directed.*`（cooldown 秒數、門檻、機率），可用 env 覆寫：
- `DIRECTED_COOLDOWN_CHANNEL_MS`（30_000）
- `DIRECTED_COOLDOWN_USER_MS`（20_000）
- `DIRECTED_THRESHOLD_HIGH`（3）
- `DIRECTED_THRESHOLD_MID`（0）
- `DIRECTED_PROB_HIGH/MID/LOW`（95/40/12，百分比整數）

## 保留選項：混合（LLM 門）—— 若日後誤判太多可改

純規則偶爾會誤判（例如開頭是 `@bot` 但其實要 bot 接龍的，會因是開頭提及而高分直回，反而剛好符合；真正的誤判是句中提及又被機率抽到）。若想更準，可在 `shouldRespond` 的分數落在中層（模糊）時，對該案例多打一次 LLM 分類 `to_bot | incidental`，只對 `to_bot` 回。成本：約每 @ +0.3 次短呼叫、模糊時 +0.3~0.5s 延遲。需注意該 LLM 呼叫應再疊一層 cooldown/取樣以免被限速。
