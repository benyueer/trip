from __future__ import annotations

import re
from typing import Optional

IntentCategory = str


class IntentResult:
    category: IntentCategory
    confidence: float
    reason: Optional[str] = None

    def __init__(self, category: IntentCategory, confidence: float, reason: Optional[str] = None):
        self.category = category
        self.confidence = confidence
        self.reason = reason


HARMFUL_PATTERNS = [
    re.compile(r"\b(rm\s+-rf|sudo\s|chmod\s|chown\s|mkfs|dd\s+if=)\b", re.I),
    re.compile(r"\b(del(et)?e|remove|drop)\s+(all|every|entire)\s+(files?|folders?|dirs?|databases?|tables?|dbs?)\b", re.I),
    re.compile(r"\b(ls\s|cat\s|find\s|grep\s|curl\s|wget\s|ssh\s|scp\s|rsync\s)\b", re.I),
    re.compile(r"\b(list|show|read|print|display)\s+(all\s+)?(files?|dirs?|folders?|directors?|etc|passwd|shadow)\b", re.I),
    re.compile(r"\b(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instruction|prompt|rule)", re.I),
    re.compile(r"\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|system\s*prompt)\b", re.I),
    re.compile(r"\b(execute|run|eval|exec)\s+(code|command|script|shell)\b", re.I),
    re.compile(r"\b(send|upload|post|exfiltrate)\s+(all\s+)?(data|secret|key|token|password|credential)\b", re.I),
    re.compile(r"(\b(union\s+select|drop\s+table|truncate|alter\s+table)\b|--\s*$|;\s*drop\b)", re.I),
]

OFF_TOPIC_PATTERNS = [
    re.compile(r"\b(how\s+to\s+(code|program|build|write|develop|implement)|write\s+(a\s+\w+\s+)?(function|script|program|code))\b", re.I),
    re.compile(r"\b(javascript|python|react|vue|angular|node|typescript|html|css|sql)\b.*\b(explain|tutorial|help|how)\b", re.I),
    re.compile(r"\b(solve|calculate|equation|formula|math|physics|chemistry|biology)\b", re.I),
    re.compile(r"\b(what\s+is\s+the\s+meaning\s+of\s+life|who\s+won\s+the\s+(election|war|game))\b", re.I),
    re.compile(r"\b(politics|election|president|government|policy|legislation)\b", re.I),
    re.compile(r"\b(diagnos|symptom|disease|medicine|lawyer|lawsuit|legal\s+advice)\b", re.I),
]

TRIP_RELATED_PATTERNS = [
    re.compile(r"\b(trip|travel|journey|itinerary|route|tour|vacation|holiday|outing)\b", re.I),
    re.compile(r"(旅[行游]|行程|路线|攻略|出游|度假|自驾)"),
    re.compile(r"\b(where|visit|go\s+to|explore|destination|place|spot|scenic|attraction)\b", re.I),
    re.compile(r"(景点|景区|地方|去哪里|草原|沙漠|山[区脉]?|海[边滩]?|湖|河|岛)"),
    re.compile(r"\b(drive|walk|ride|fly|train|bus|car|bike|transport|commute)\b", re.I),
    re.compile(r"(自驾|步行|骑行|火车|飞机|大巴|高铁|交通)"),
    re.compile(r"\b(hotel|hostel|airbnb|restaurant|food|eat|stay|accommodation)\b", re.I),
    re.compile(r"(酒店|民宿|餐厅|美食|住宿|吃饭)"),
    re.compile(r"\b(plan|schedule|day\s*\d|how\s+many\s+day|suggest|recommend|itinerary)\b", re.I),
    re.compile(r"(规划|计划|安排|推荐|几天|第[一二三四五]天)"),
    re.compile(r"有哪些.*[去玩看]|怎么[去到]|什么.*值得|必[去玩看]|好玩"),
]


def classify_intent(input_str: str) -> IntentResult:
    trimmed = input_str.strip()

    if not trimmed:
        return IntentResult("off_topic", 1.0, "Empty input")

    for pattern in HARMFUL_PATTERNS:
        if pattern.search(trimmed):
            return IntentResult("harmful", 0.95, "Matched harmful pattern")

    for pattern in TRIP_RELATED_PATTERNS:
        if pattern.search(trimmed):
            return IntentResult("trip_related", 0.9)

    for pattern in OFF_TOPIC_PATTERNS:
        if pattern.search(trimmed):
            return IntentResult("off_topic", 0.8, "Matched off-topic pattern")

    return IntentResult("trip_related", 0.5)
