// Register the "trade-system" flag scope
Hooks.once("init", () => {
    console.log("Initializing BarterBetter module...");
    game.settings.register("barterbetter", "trade-system", {
        name: "Trade System",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    game.socket.on("module.barterbetter", async (data) => {
        if (data.action === "requestGMApproval" && game.user.isGM) {
            const { playerActorId, merchantActorId, haggleMultiplier, merchantItems, playerSelected, merchantSelected, playerValue, merchantValue } = data;
            const playerActor = game.actors.get(playerActorId);
            const merchantActor = game.actors.get(merchantActorId);

            console.log("Received trade approval request from player.");

            const content = `
                <p>Approve trade between ${playerActor.name} and ${merchantActor.name}?</p>
                <button data-action="approve">Approve</button>
                <button data-action="reject">Reject</button>
            `;
            ChatMessage.create({
                user: game.user.id,
                speaker: { alias: "Trade System" },
                content: content,
                whisper: [game.user.id]
            });

            Hooks.once("renderChatMessage", (message, html) => {
                html.find("button[data-action='approve']").click(async () => {
                    console.log("GM approved the trade.");
                    await finalizeTrade(playerActor, merchantActor, haggleMultiplier, merchantItems, playerSelected, merchantSelected, playerValue, merchantValue);
                });
                html.find("button[data-action='reject']").click(() => {
                    console.log("GM rejected the trade.");
                    ui.notifications.info("Trade rejected by GM.");
                });
            });
        }
    });
});

// Add event listener for canvas clicks
Hooks.on("canvasReady", () => {
    console.log("Canvas is ready...");
    canvas.stage.on("mousedown", async (event) => {
        console.log("Canvas clicked...");
        const clickPosition = event.data.getLocalPosition(canvas.tokens);
        const clickedToken = getTokenAtPosition(clickPosition);

        console.log("clickedToken", clickedToken);
        console.log("clickPosition", clickPosition);

        if (clickedToken) {
            console.log("Token clicked:", clickedToken);
            const playerActor = game.user.character;
            const merchantActor = clickedToken.actor;
            console.log("merchantActor", merchantActor);

            if (merchantActor.type === "npc") {
                const merchantId = merchantActor.id;
                let charismaCheck = playerActor.getFlag("barterbetter", `charismaCheck-${merchantId}`);
                if (!charismaCheck) {
                    charismaCheck = await performCharismaCheck(playerActor);
                    await playerActor.setFlag("barterbetter", `charismaCheck-${merchantId}`, charismaCheck);
                }
                const priceModifier = calculatePriceModifier(charismaCheck);

                new Dialog({
                    title: "Confirm Trade",
                    content: `<p>Do you want to initiate a trade with ${merchantActor.name}?</p>`,
                    buttons: {
                        yes: {
                            label: "Yes",
                            callback: async () => {
                                await initiateTrade(playerActor, merchantActor, priceModifier);
                            }
                        },
                        no: {
                            label: "No"
                        }
                    }
                }).render(true);
            }
        }
    });
});

function getTokenAtPosition(position) {
    console.log("canvas.tokens", canvas.tokens);
    console.log("position", position);

    return canvas.tokens.placeables.find(token => {
        const bounds = token.bounds; // Updated for Foundry VTT v12
        return bounds.contains(position.x, position.y);
    });
}

async function performCharismaCheck(actor) {
    const roll = new Roll("1d20 + @abilities.cha.mod", actor.getRollData());
    const result = await roll.roll({ async: true });
    console.log(`Charisma check result: ${result.total}`);
    return result.total;
}

function calculatePriceModifier(charismaCheck) {
    const difference = charismaCheck - 10;
    const modifier = Math.floor(difference / 2) * 0.1;
    return 1 + modifier;
}

// Function to Initiate Trade
async function initiateTrade(playerActor, merchantActor, priceModifier) {
    console.log("Initiating trade between", playerActor?.name, "and", merchantActor.name);
    const playerGold = playerActor?.system.currency.gp || 0;
    const merchantGold = merchantActor.system.currency.gp || 0;

    const playerInventoryHtml = generateInventoryHtml(playerActor, "player", priceModifier);
    const merchantInventoryHtml = generateInventoryHtml(merchantActor, "merchant", priceModifier);

    // Remember the merchant's inventory items
    const merchantItems = merchantActor.items.map(item => item.toObject());

    let haggleMultiplier = 1; // Default haggle multiplier

    const dialogContent = `
        <div style="display: flex; justify-content: space-between; width: 100%;">
            <div style="width: 48%;">
                <h3>${playerActor?.name}</h3>
                <p>Gold: <span id="player-gold">${playerGold}</span></p>
                <div style="border: 1px solid #ccc; height: 200px; overflow-y: auto;">
                    <table id="player-inventory" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="padding: 8px; width: 10%;">Select</th>
                                <th style="padding: 8px; width: 50%;">Item</th>
                                <th style="padding: 8px; width: 20%;">Amount</th>
                                <th style="padding: 8px; width: 20%;">Value</th>
                            </tr>
                        </thead>
                        <tbody>${playerInventoryHtml}</tbody>
                    </table>
                </div>
                <div>Total Value: <span id="player-total">0</span> gp</div>
                <button id="haggle-button">Haggle</button>
            </div>
            <div style="width: 48%;">
                <h3>${merchantActor.name}</h3>
                <p>Gold: <span id="merchant-gold">${merchantGold}</span></p>
                <div style="border: 1px solid #ccc; height: 200px; overflow-y: auto;">
                    <table id="merchant-inventory" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr>
                                <th style="padding: 8px; width: 10%;">Select</th>
                                <th style="padding: 8px; width: 50%;">Item</th>
                                <th style="padding: 8px; width: 20%;">Amount</th>
                                <th style="padding: 8px; width: 20%;">Value</th>
                            </tr>
                        </thead>
                        <tbody>${merchantInventoryHtml}</tbody>
                    </table>
                </div>
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
                callback: () => {
                    console.log("Player sent trade request for approval.");
                    requestGMApproval(playerActor, merchantActor, haggleMultiplier, merchantItems);
                }
            },
            cancel: {
                label: "Cancel",
                callback: () => console.log("Trade cancelled.")
            }
        },
        render: (html) => {
            html.find("#haggle-button").on("click", async () => {
                const roll = new Roll("1d20 + @abilities.cha.mod", playerActor.getRollData());
                const result = await roll.roll({ async: true });
                console.log(`Haggle roll result: ${result.total}`);
                ChatMessage.create({
                    user: game.user.id,
                    speaker: ChatMessage.getSpeaker({ actor: playerActor }),
                    content: `Haggle roll result: ${result.total}`
                });

                let charismaCheck = merchantActor.getFlag("trade-system", `charismaCheck-${playerActor.id}`);
                if (result.total > 10) {
                    charismaCheck += 1;
                } else {
                    charismaCheck -= 1;
                }
                merchantActor.setFlag("trade-system", `charismaCheck-${playerActor.id}`, charismaCheck);

                const bonus = Math.floor((charismaCheck - 10) / 2) * 0.1;
                haggleMultiplier = 1 + bonus;

                html.find("#merchant-total").text((parseFloat(html.find("#merchant-total").text()) * haggleMultiplier).toFixed(2));
                html.find("#player-total").text((parseFloat(html.find("#player-total").text()) / haggleMultiplier).toFixed(2));

                ui.notifications.info(`Haggle result: Multiplier set to ${haggleMultiplier.toFixed(2)}`);
            });

            html.find("input[type='checkbox']").on("change", () => updateTotalValues(html));
        }
    }).render(true);
}

function generateInventoryHtml(actor, type, priceModifier) {
    return actor.items.filter(i => i.type === "equipment" || i.type === "consumable" || i.type === "loot")
        .map(item => {
            const price = item.system.price || 0;
            const modifiedPrice = (price * priceModifier).toFixed(2);
            const displayPrice = price > 0 ? modifiedPrice : '?';
            return `<tr>
                        <td style="padding: 8px; width: 10%;"><input type="checkbox" data-id="${item.id}" data-price="${modifiedPrice}" class="${type}-item"></td>
                        <td style="padding: 8px; width: 50%;">${item.name}</td>
                        <td style="padding: 8px; width: 20%;">${item.system.quantity || 1}</td>
                        <td style="padding: 8px; width: 20%;">${displayPrice} gp</td>
                    </tr>`;
        })
        .join("");
}

function updateTotalValues(html) {
    const playerTotal = Array.from(html.find(".player-item:checked")).reduce((sum, el) => {
        const price = parseFloat(el.dataset.price || 0);
        return price > 0 ? sum + price : sum;
    }, 0);
    const merchantTotal = Array.from(html.find(".merchant-item:checked")).reduce((sum, el) => {
        const price = parseFloat(el.dataset.price || 0);
        return price > 0 ? sum + price : sum;
    }, 0);

    html.find("#player-total").text(playerTotal.toFixed(2));
    html.find("#merchant-total").text(merchantTotal.toFixed(2));
}

async function requestGMApproval(playerActor, merchantActor, haggleMultiplier, merchantItems) {
    const playerSelected = Array.from(document.querySelectorAll(".player-item:checked"));
    const merchantSelected = Array.from(document.querySelectorAll(".merchant-item:checked"));

    let playerValue = playerSelected.reduce((sum, el) => {
        const price = parseFloat(el.dataset.price || 0);
        return price > 0 ? sum + price : sum;
    }, 0) * haggleMultiplier;
    let merchantValue = merchantSelected.reduce((sum, el) => {
        const price = parseFloat(el.dataset.price || 0);
        return price > 0 ? sum + price : sum;
    }, 0) / haggleMultiplier;

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

    // Request GM approval via socket
    const gm = game.users.find(user => user.isGM && user.active);
    if (gm) {
        console.log("Sending trade approval request to GM.");
        game.socket.emit("module.barterbetter", {
            action: "requestGMApproval",
            playerActorId: playerActor.id,
            merchantActorId: merchantActor.id,
            haggleMultiplier,
            merchantItems,
            playerSelected: playerSelected.map(el => el.dataset.id),
            merchantSelected: merchantSelected.map(el => el.dataset.id),
            playerValue,
            merchantValue
        });
    }
}

async function finalizeTrade(playerActor, merchantActor, haggleMultiplier, merchantItems, playerSelected, merchantSelected, playerValue, merchantValue) {
    // Transfer items
    const playerItemsToCreate = playerSelected.map(id => {
        const item = playerActor.items.get(id);
        return item.toObject();
    });

    const merchantItemsToCreate = merchantSelected.map(id => {
        const item = merchantItems.find(i => i._id === id);
        return item;
    });

    await playerActor.createEmbeddedDocuments("Item", merchantItemsToCreate);
    await playerActor.createEmbeddedDocuments("Item", playerItemsToCreate);

    // Delete original items
    await playerActor.deleteEmbeddedDocuments("Item", playerSelected);
    await merchantActor.deleteEmbeddedDocuments("Item", merchantSelected);

    // Adjust gold
    await playerActor.update({ "system.currency.gp": playerGold + playerValue - merchantValue });
    await merchantActor.update({ "system.currency.gp": merchantGold + merchantValue - playerValue });

    ui.notifications.info("Trade completed successfully!");
}
