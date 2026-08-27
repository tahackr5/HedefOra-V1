import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("explains that the shell does not expose product actions", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Uygulama altyapısı hazırlanıyor." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Henüz kullanıcı işlemleri sunmuyor/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("provides landmarks and an independence notice", () => {
    render(<App />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("contentinfo")).toHaveTextContent(
      "HedefOra bağımsız bir üründür; herhangi bir resmî kurumla bağlantılı değildir.",
    );
  });

  it("makes the skip link the first keyboard target", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.tab();

    expect(screen.getByRole("link", { name: "İçeriğe geç" })).toHaveFocus();
  });
});
