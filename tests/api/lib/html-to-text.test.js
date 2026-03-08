import { describe, it, expect } from "vitest";
import { htmlToText, constrainImages } from "../../../src/api/lib/html-to-text.js";

describe("htmlToText", () => {
  it("returns empty string for falsy input", () => {
    expect(htmlToText("")).toBe("");
    expect(htmlToText(null)).toBe("");
    expect(htmlToText(undefined)).toBe("");
    expect(htmlToText(0)).toBe("");
    expect(htmlToText(false)).toBe("");
  });

  it("strips simple HTML tags", () => {
    expect(htmlToText("<p>Hello</p>")).toBe("Hello");
  });

  it("converts <br> to newlines", () => {
    expect(htmlToText("Hello<br>World")).toBe("Hello\nWorld");
    expect(htmlToText("Hello<br/>World")).toBe("Hello\nWorld");
    expect(htmlToText("Hello<br />World")).toBe("Hello\nWorld");
    expect(htmlToText("Hello<BR>World")).toBe("Hello\nWorld");
  });

  it("converts closing block tags to double newlines", () => {
    expect(htmlToText("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
    expect(htmlToText("<div>A</div><div>B</div>")).toBe("A\n\nB");
    expect(htmlToText("<h1>Title</h1>")).toBe("Title");
    expect(htmlToText("<h2>Title</h2>")).toBe("Title");
    expect(htmlToText("<h3>Title</h3>")).toBe("Title");
    expect(htmlToText("<h4>Title</h4>")).toBe("Title");
    expect(htmlToText("<h5>Title</h5>")).toBe("Title");
    expect(htmlToText("<h6>Title</h6>")).toBe("Title");
    expect(htmlToText("<blockquote>Quote</blockquote>")).toBe("Quote");
  });

  it("converts <li> to bullet points", () => {
    expect(htmlToText("<ul><li>One</li><li>Two</li></ul>")).toBe(
      "- One\n\n- Two"
    );
  });

  it("converts <hr> to dashes", () => {
    expect(htmlToText("Above<hr>Below")).toBe("Above\n---\nBelow");
    expect(htmlToText("Above<hr/>Below")).toBe("Above\n---\nBelow");
    expect(htmlToText("Above<hr />Below")).toBe("Above\n---\nBelow");
  });

  it("converts <tr> closing tags to double newlines", () => {
    expect(htmlToText("<tr><td>A</td></tr><tr><td>B</td></tr>")).toBe("A\n\nB");
  });

  it("extracts href from links", () => {
    expect(htmlToText('<a href="https://example.com">Click here</a>')).toBe(
      "Click here (https://example.com)"
    );
  });

  it("extracts href from links with single quotes", () => {
    expect(htmlToText("<a href='https://example.com'>Click</a>")).toBe(
      "Click (https://example.com)"
    );
  });

  it("extracts href from links with extra attributes", () => {
    expect(
      htmlToText(
        '<a class="link" href="https://example.com" target="_blank">Link</a>'
      )
    ).toBe("Link (https://example.com)");
  });

  it("decodes common HTML entities", () => {
    // Note: &lt; and &gt; decode to < and > which form tag-like patterns
    // that get stripped by the iterative tag stripping (defense against injection).
    // Test entities that don't produce angle brackets:
    expect(htmlToText("&amp;")).toBe("&");
    expect(htmlToText("&quot;")).toBe('"');
    expect(htmlToText("&#39; &apos;")).toBe("' '");
    // &nbsp; decodes to a regular space which gets trimmed when alone
    expect(htmlToText("word&nbsp;word")).toBe("word word");
    expect(htmlToText("&mdash; &ndash;")).toBe("\u2014 \u2013");
    expect(htmlToText("&hellip;")).toBe("\u2026");
    expect(htmlToText("&lsquo;&rsquo;")).toBe("\u2018\u2019");
    expect(htmlToText("&ldquo;&rdquo;")).toBe("\u201C\u201D");
  });

  it("strips decoded &lt;/&gt; as tag-like patterns (defense against injection)", () => {
    // &lt; and &gt; decode to < and >, forming tag-like content that gets stripped
    // by the iterative tag stripping loop. This is intentional behavior.
    expect(htmlToText("&lt;script&gt;alert('xss')&lt;/script&gt;")).toBe(
      "alert('xss')"
    );
    // When decoded < and > don't form complete tags, partial content may remain
    expect(htmlToText("5 &gt; 3")).toBe("5 > 3");
  });

  it("decodes decimal numeric entities", () => {
    expect(htmlToText("&#65;")).toBe("A"); // &#65; = 'A'
    expect(htmlToText("&#8212;")).toBe("\u2014"); // em dash
  });

  it("decodes hex numeric entities", () => {
    expect(htmlToText("&#x41;")).toBe("A"); // &#x41; = 'A'
    expect(htmlToText("&#x2014;")).toBe("\u2014"); // em dash
  });

  it("passes through unknown named entities unchanged", () => {
    expect(htmlToText("&unknown;")).toBe("&unknown;");
  });

  it("handles invalid numeric entities gracefully", () => {
    // Invalid code point - decodeNumericEntity returns null, entity passes through
    expect(htmlToText("&#xFFFFFFFF;")).toBe("&#xFFFFFFFF;");
  });

  it("collapses 3+ newlines into double newlines", () => {
    expect(htmlToText("<p>A</p><p></p><p>B</p>")).toBe("A\n\nB");
  });

  it("trims leading and trailing whitespace", () => {
    expect(htmlToText("  <p>Hello</p>  ")).toBe("Hello");
  });

  it("strips nested HTML tags", () => {
    expect(htmlToText("<div><span><b>Bold</b></span></div>")).toBe("Bold");
  });

  it("handles complex real-world HTML", () => {
    const html = `
      <h1>Newsletter</h1>
      <p>Here is some <strong>important</strong> content.</p>
      <ul>
        <li>Item one</li>
        <li>Item two</li>
      </ul>
      <p>Visit <a href="https://example.com">our site</a>.</p>
    `;
    const text = htmlToText(html);
    expect(text).toContain("Newsletter");
    expect(text).toContain("important");
    expect(text).toContain("- Item one");
    expect(text).toContain("- Item two");
    expect(text).toContain("our site (https://example.com)");
  });

  it("uses iterative tag stripping for defense against incomplete sanitization", () => {
    // After first pass of entity decoding, < and > from &lt; &gt; could create new "tags"
    // But since entity decoding happens before tag stripping, the iterative stripping handles it
    const html = "<p>Text with &lt;fake&gt; tags</p>";
    const text = htmlToText(html);
    // &lt; decodes to < and &gt; to >, creating <fake> which gets stripped
    expect(text).toContain("Text with");
    expect(text).not.toContain("<fake>");
  });
});

describe("constrainImages", () => {
  it("returns empty string for falsy input", () => {
    expect(constrainImages("")).toBe("");
    expect(constrainImages(null)).toBe("");
    expect(constrainImages(undefined)).toBe("");
    expect(constrainImages(0)).toBe("");
    expect(constrainImages(false)).toBe("");
  });

  it("adds style to images without existing style", () => {
    const result = constrainImages('<img src="photo.jpg">');
    expect(result).toBe(
      '<img src="photo.jpg" style="max-width: 100%; height: auto;">'
    );
  });

  it("prepends style to images with existing style", () => {
    const result = constrainImages(
      '<img src="photo.jpg" style="border: 1px solid red;">'
    );
    expect(result).toBe(
      '<img src="photo.jpg" style="max-width: 100%; height: auto; border: 1px solid red;">'
    );
  });

  it("handles img with multiple attributes", () => {
    const result = constrainImages(
      '<img src="photo.jpg" alt="Photo" width="600">'
    );
    expect(result).toBe(
      '<img src="photo.jpg" alt="Photo" width="600" style="max-width: 100%; height: auto;">'
    );
  });

  it("handles multiple images", () => {
    const html =
      '<img src="a.jpg"><p>text</p><img src="b.jpg" style="border: none;">';
    const result = constrainImages(html);
    expect(result).toContain(
      '<img src="a.jpg" style="max-width: 100%; height: auto;">'
    );
    expect(result).toContain(
      '<img src="b.jpg" style="max-width: 100%; height: auto; border: none;">'
    );
  });

  it("is case insensitive for img tag", () => {
    const result = constrainImages('<IMG src="photo.jpg">');
    expect(result).toContain("max-width: 100%");
  });

  it("is case insensitive for style attribute detection", () => {
    const result = constrainImages('<img src="photo.jpg" STYLE="border: 0;">');
    // The style= replacement regex requires double quotes and is case-insensitive
    expect(result).toContain("max-width: 100%");
  });

  it("leaves non-image HTML unchanged", () => {
    const html = '<p>Hello <a href="url">link</a></p>';
    expect(constrainImages(html)).toBe(html);
  });

  it("handles self-closing img tags", () => {
    const result = constrainImages('<img src="photo.jpg" />');
    // The regex captures everything inside <img...> so self-closing slash is part of attrs
    expect(result).toContain("max-width: 100%");
  });
});
