from playwright.sync_api import sync_playwright, expect
import os

shop_file_path = os.path.abspath("www.smaiclub.top/shop/index.html")
shop_url = f"file://{shop_file_path}"

def test_downgrade_prevention(page):
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

    # Mock user as SVIP2 (Level 3)
    page.route("**/api/me", lambda route: route.fulfill(
        status=200, content_type="application/json", body='{"loggedIn": true, "username": "rich_user", "role": "svip2"}'
    ))

    # Mock buy endpoint (should fail if logic is correct, but here we test frontend prevention first)
    page.route("**/api/buy", lambda route: route.fulfill(
        status=400, content_type="application/json", body='{"error": "cannot_downgrade"}'
    ))

    # Mock auth script
    page.route("**/common-auth.js", lambda route: route.fulfill(
        status=200, content_type="application/javascript", body='console.log("Mock auth loaded");'
    ))

    page.goto(shop_url)

    # Wait for DOMContentLoaded logic to run (fetch api/me)
    page.wait_for_timeout(1000)

    # 1. Check if VIP card (Level 1) is disabled
    # The script sets opacity 0.5 and pointer-events none
    vip_card = page.locator(".tier-card").nth(0)

    # Check opacity
    expect(vip_card).to_have_css("opacity", "0.5")

    # Check pointer-events (Playwright checks computed style)
    expect(vip_card).to_have_css("pointer-events", "none")

    # 2. Attempt to click (should not work or trigger selectTier)
    # Since pointer-events: none, click might fail or pass through.
    # We can try to force click and check if form appears.

    vip_card.click(force=True) # Force click ignores pointer-events check in Playwright action, but browser event might be suppressed?
    # Actually, pointer-events:none prevents JS click events in browser.
    # But Playwright force=True might dispatch it directly.
    # However, our selectTier function HAS a check!

    # Check if form appeared?
    # Form is #info-form.
    # It should NOT be visible (active class).
    expect(page.locator("#info-form")).not_to_be_visible()

    # Check if Alert appeared (because of selectTier check)
    # If click went through, selectTier called -> check level -> alert.
    if page.locator("#alert-modal").is_visible():
        print("Alert shown: Downgrade prevented.")
    else:
        print("Click prevented by CSS or logic.")

    page.screenshot(path="verification/shop_downgrade_prevention.png")
    print("Downgrade prevention UI test passed.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_downgrade_prevention(page)
        except Exception as e:
            print(f"FAILED: {e}")
        finally:
            browser.close()
