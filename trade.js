Hooks.once('init', () => {
    console.log("Trade System Module | Initializing...");

    // Register trade functionality
    game.tradesystem = {
        initiateTrade: async (merchantActor) => {
            const playerUser = game.user;
            const playerActor = playerUser.character;

            if (!playerActor) {
                ui.notifications.error("No character assigned to the player.");
                return;
            }

            // Display trade UI
            const playerInventory = playerActor.items.map(item => `<li>${item.name} (${item.system.quantity || 1})</li>`).join("");
            const merchantInventory = merchantActor.items.map(item => `<li>${item.name} (${item.system.quantity || 1})</li>`).join("");

            const dialogContent = `
                <div class="trade-container">
                    <div class="trade-player">
                        <h3>${playerActor.name}'s Inventory</h3>
                        <ul>${playerInventory}</ul>
                    </div>
                    <div class="trade-merchant">
                        <h3>${merchantActor.name}'s Inventory</h3>
                        <ul>${merchantInventory}</ul>
                    </div>
                </div>
            `;

            new Dialog({
                title: "Trade Screen",
                content: dialogContent,
                buttons: {
                    trade: {
                        label: "Confirm Trade",
                        callback: () => console.log("Trade confirmed!")
                    },
                    cancel: {
                        label: "Cancel",
                        callback: () => console.log("Trade cancelled.")
                    }
                }
            }).render(true);
        }
    };

    console.log("Trade System Module | Ready!");
});

Hooks.on('renderTokenHUD', (hud, html, data) => {
    const token = canvas.tokens.get(data._id);
    if (!token?.actor) return;

    // Add trade button
    const tradeButton = $(`<div class="control-icon trade-icon" title="Initiate Trade">
        <i class="fas fa-exchange-alt"></i>
    </div>`);

    html.find(".col.left").append(tradeButton);

    tradeButton.on("click", () => {
        if (game.user.isGM) {
            game.tradesystem.initiateTrade(token.actor);
        } else {
            ui.notifications.warn("Only the GM can initiate a trade.");
        }
    });
});
