"""HTML sanitisation for rich-text content (messages, KB articles). Prevents stored XSS."""
import re

import nh3

_ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "a", "span", "hr", "img", "table", "thead", "tbody", "tr", "th", "td",
}
_ALLOWED_ATTRS = {
    "a": {"href", "title", "target"},
    "img": {"src", "alt", "title"},
    "span": {"class", "data-type", "data-id", "data-label"},
    "p": {"dir"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}


def sanitize_html(value: str | None) -> str:
    if not value:
        return ""
    return nh3.clean(
        value,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        url_schemes={"http", "https", "mailto", "tel"},
        link_rel="noopener noreferrer nofollow",
    )


def html_to_text(value: str | None) -> str:
    if not value:
        return ""
    text = nh3.clean(value, tags=set())
    text = text.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", text).strip()


def is_blank_html(value: str | None) -> bool:
    return not html_to_text(value)
