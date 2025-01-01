// Add a Button for GM to Set Merchant Type
Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user.isGM) return;

    const tokenControls = controls.find(control => control.name === "token");
    if (!tokenControls) return;

    tokenControls.tools.push({
        name: "set-merchant",
        title: "Set Merchant",
        icon: "fas fa-store",
        visible: game.user.isGM,
        onClick: () => {
            const selectedToken = canvas.tokens.controlled[0];
            if (!selectedToken) {
                ui.notifications.error("No token selected.");
                return;
            }

            const actor = selectedToken.actor;
            if (!actor) {
                ui.notifications.error("Selected token does not have an actor.");
                return;
            }

            const currentType = actor.getFlag("trade-system", "merchantType") || "Creature";
            if (currentType === "Merchant") {
                actor.setFlag("trade-system", "merchantType", "Creature").then(() => {
                    ui.notifications.info(`${actor.name} is no longer a Merchant.`);
                });
            } else {
                actor.setFlag("trade-system", "merchantType", "Merchant").then(() => {
                    ui.notifications.info(`${actor.name} is now a Merchant.`);
                });
            }
        },
        button: true
    });
});

// Add event listener for canvas clicks
Hooks.on("canvasReady", () => {
    canvas.stage.on("mousedown", async (event) => {
        const clickPosition = event.data.getLocalPosition(canvas.tokens);
        const clickedToken = getTokenAtPosition(clickPosition);

        if (clickedToken) {
            const playerActor = game.user.character;
            if (!playerActor) {
                ui.notifications.error("You must have a character assigned to trade.");
                return;
            }

            const merchantActor = clickedToken.actor;
            if (!merchantActor || merchantActor.getFlag("trade-system", "merchantType") !== "Merchant") {
                ui.notifications.error("Clicked token is not a Merchant.");
                return;
            }

            initiateTrade(playerActor, merchantActor);
        }
    });
});

function getTokenAtPosition(position) {
    return canvas.tokens.placeables.find(token => {
        const bounds = token.getBounds();
        return bounds.contains(position.x, position.y);
    });
}

function findNearestMerchant(clickPosition) {
    const clickX = clickPosition.x;
    const clickY = clickPosition.y;
    let nearestMerchant = null;
    let minDistance = Infinity;

    game.scenes.current.tokens.forEach((token) => {
        const position = {
            x: token.x + token.width / 2,
            y: token.y + token.height / 2
        };
        const distance = Math.hypot(position.x - clickX, position.y - clickY);
        if (distance <= 15 && token.actor.data.flags.tags.includes("merchant")) {
            if (distance < minDistance) {
                minDistance = distance;
                nearestMerchant = token.actor;
            }
        }
    });

    return nearestMerchant;
}

// Function to Initiate Trade
function initiateTrade(playerActor, merchantActor) {
    const playerGold = playerActor.system.currency.gp || 0;
    const merchantGold = merchantActor.system.currency.gp || 0;

    const playerInventoryHtml = generateInventoryHtml(playerActor, "player");
    const merchantInventoryHtml = generateInventoryHtml(merchantActor, "merchant");

    let haggleMultiplier = 1; // Default haggle multiplier

    const dialogContent = `
        <div style="display: flex; justify-content: space-between;">
            <div>
                <h3>${playerActor.name}</h3>
                <p>Gold: <span id="player-gold">${playerGold}</span></p>
                <ul id="player-inventory" style="border: 1px solid #ccc; padding: 10px;">${playerInventoryHtml}</ul>
                <div>Total Value: <span id="player-total">0</span> gp</div>
                <button id="haggle-button">Haggle</button>
            </div>
            <div>
                <h3>${merchantActor.name}</h3>
                <p>Gold: <span id="merchant-gold">${merchantGold}</span></p>
                <ul id="merchant-inventory" style="border: 1px solid #ccc; padding: 10px;">${merchantInventoryHtml}</ul>
                <div>Total Value: <span id="merchant-total">0</span> gp</div>
            </div>
        </div>
    `;

    new Dialog({
        title: "Trade Screen",
        content: dialogContent,
        buttons: {
            finalize: {
                label: "Finalize Trade",
                callback: () => finalizeTrade(playerActor, merchantActor, haggleMultiplier)
            },
            cancel: {
                label: "Cancel",
                callback: () => console.log("Trade cancelled.")
            }
        },
        render: (html) => {
            html.find("#haggle-button").on("click", async () => {
                const roll = await playerActor.rollSkill("persuasion", { event: null });
                const rollResult = roll.total;

                if (rollResult > 10) {
                    const bonus = Math.floor((rollResult - 10) / 2) * 0.1;
                    haggleMultiplier = 1 + bonus;
                } else {
                    const penalty = Math.floor((10 - rollResult) / 2) * 0.1;
                    haggleMultiplier = 1 - penalty;
                }

                html.find("#merchant-total").text((parseFloat(html.find("#merchant-total").text()) * haggleMultiplier).toFixed(2));
                html.find("#player-total").text((parseFloat(html.find("#player-total").text()) / haggleMultiplier).toFixed(2));

                ui.notifications.info(`Haggle result: Multiplier set to ${haggleMultiplier.toFixed(2)}`);
            });

            html.find("input[type='checkbox']").on("change", () => updateTotalValues(html));
        }
    }).render(true);
}

function generateInventoryHtml(actor, type) {
    return actor.items.filter(i => i.type === "equipment" || i.type === "consumable" || i.type === "loot")
        .map(item => `<li><input type="checkbox" data-id="${item.id}" data-price="${item.system.price || 0}" class="${type}-item"> ${item.name} (${item.system.quantity || 1})</li>`)
        .join("");
}

function updateTotalValues(html) {
    const playerTotal = Array.from(html.find(".player-item:checked")).reduce((sum, el) => sum + parseFloat(el.dataset.price || 0), 0);
    const merchantTotal = Array.from(html.find(".merchant-item:checked")).reduce((sum, el) => sum + parseFloat(el.dataset.price || 0), 0);

    html.find("#player-total").text(playerTotal.toFixed(2));
    html.find("#merchant-total").text(merchantTotal.toFixed(2));
}

async function finalizeTrade(playerActor, merchantActor, haggleMultiplier) {
    const playerSelected = Array.from(document.querySelectorAll(".player-item:checked"));
    const merchantSelected = Array.from(document.querySelectorAll(".merchant-item:checked"));

    let playerValue = playerSelected.reduce((sum, el) => sum + parseFloat(el.dataset.price || 0), 0) * haggleMultiplier;
    let merchantValue = merchantSelected.reduce((sum, el) => sum + parseFloat(el.dataset.price || 0), 0) / haggleMultiplier;

    const playerGold = playerActor.system.currency.gp || 0;
    const merchantGold = merchantActor.system.currency.gp || 0;

    if (playerValue > merchantGold + merchantValue) {
        ui.notifications.error("Merchant cannot afford the trade.");
        return;
    }

    if (merchantValue > playerGold + playerValue) {
        ui.notifications.error("Player cannot afford the trade.");
        return;
    }

    // Transfer items
    playerSelected.forEach(el => {
        const item = playerActor.items.get(el.dataset.id);
        playerActor.deleteEmbeddedDocuments("Item", [item.id]);
        merchantActor.createEmbeddedDocuments("Item", [item.toObject()]);
    });

    merchantSelected.forEach(el => {
        const item = merchantActor.items.get(el.dataset.id);
        merchantActor.deleteEmbeddedDocuments("Item", [item.id]);
        playerActor.createEmbeddedDocuments("Item", [item.toObject()]);
    });

    // Adjust gold
    playerActor.update({ "system.currency.gp": playerGold + playerValue - merchantValue });
    merchantActor.update({ "system.currency.gp": merchantGold + merchantValue - playerValue });

    ui.notifications.info("Trade completed successfully!");
}
