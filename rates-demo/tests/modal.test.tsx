import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Modal from "@/components/Modal";

let mobileMock = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/lib/useIsMobileViewport", () => ({
  useIsMobileViewport: () => mobileMock,
}));

describe("Modal", () => {
  beforeEach(() => {
    mobileMock = false;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders title and closes on overlay click or escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal title="Swap Modal" onClose={onClose}>
        <div>Body</div>
      </Modal>
    );

    expect(screen.getByText("Swap Modal")).toBeInTheDocument();
    const overlay = document.querySelector(".absolute.inset-0") as HTMLElement;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("toggles maximized state on desktop", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal title="Desktop Modal" onClose={onClose}>
        <div>Content</div>
      </Modal>
    );

    const shell = document.querySelector("div.relative.overflow-auto") as HTMLElement;
    expect(shell.className).toContain("rounded-lg");

    await user.click(screen.getByLabelText("Maximize"));
    expect(shell.className).toContain("rounded-none");
    expect(screen.getByLabelText("Restore")).toBeInTheDocument();
  });

  it("starts maximized and hides toggle button on mobile", () => {
    mobileMock = true;
    render(
      <Modal title="Mobile Modal" onClose={() => {}}>
        <div>Mobile</div>
      </Modal>
    );

    const shell = document.querySelector("div.relative.overflow-auto") as HTMLElement;
    expect(shell.className).toContain("rounded-none");
    expect(screen.queryByLabelText("Maximize")).not.toBeInTheDocument();
  });
});
