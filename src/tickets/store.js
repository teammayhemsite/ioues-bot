const fs = require("fs");
const path = require("path");

const DEFAULT_DATA_FILE = path.join(__dirname, "..", "..", "data", "tickets.json");
const MAX_CLOSED_HISTORY = 500;

function createEmptyState() {
    return {
        counter: 0,
        panel: {
            channelId: null,
            messageId: null
        },
        tickets: {}
    };
}

class TicketStore {
    constructor(filePath = DEFAULT_DATA_FILE) {
        this.filePath = filePath || DEFAULT_DATA_FILE;
        this.data = createEmptyState();
        this.load();
    }

    get counter() {
        return this.data.counter;
    }

    load() {
        try {
            if (!fs.existsSync(this.filePath)) {
                return;
            }

            const raw = fs.readFileSync(this.filePath, "utf8");
            if (!raw.trim()) {
                return;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return;
            }

            this.data = {
                counter: Number.isFinite(Number(parsed.counter)) && Number(parsed.counter) >= 0
                    ? Math.floor(Number(parsed.counter))
                    : 0,
                panel: {
                    channelId: parsed.panel?.channelId || null,
                    messageId: parsed.panel?.messageId || null
                },
                tickets: parsed.tickets && typeof parsed.tickets === "object" && !Array.isArray(parsed.tickets)
                    ? { ...parsed.tickets }
                    : {}
            };
        } catch (err) {
            console.warn(`⚠️ [Tickets] Não foi possível ler ${this.filePath}: ${err.message}. Iniciando com estado limpo.`);
            this.data = createEmptyState();
        }
    }

    pruneClosed() {
        const closed = Object.entries(this.data.tickets)
            .filter(([, ticket]) => ticket && ticket.status !== "open");

        if (closed.length <= MAX_CLOSED_HISTORY) {
            return;
        }

        closed.sort((a, b) => {
            const timeA = new Date(a[1].closedAt || a[1].createdAt || 0).getTime();
            const timeB = new Date(b[1].closedAt || b[1].createdAt || 0).getTime();
            return timeA - timeB;
        });

        const toRemove = closed.length - MAX_CLOSED_HISTORY;
        for (let i = 0; i < toRemove; i++) {
            delete this.data.tickets[closed[i][0]];
        }
    }

    save() {
        try {
            this.pruneClosed();

            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const serialized = JSON.stringify(this.data, null, 2);
            const tempPath = `${this.filePath}.tmp`;

            try {
                fs.writeFileSync(tempPath, serialized, "utf8");
                fs.renameSync(tempPath, this.filePath);
            } catch {
                try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
                fs.writeFileSync(this.filePath, serialized, "utf8");
            }
        } catch (err) {
            console.warn(`⚠️ [Tickets] Não foi possível salvar ${this.filePath}: ${err.message}`);
        }
    }

    nextNumber() {
        this.data.counter += 1;
        this.save();
        return this.data.counter;
    }

    bumpCounter(value) {
        const num = Math.floor(Number(value));
        if (Number.isFinite(num) && num > this.data.counter) {
            this.data.counter = num;
            this.save();
        }
        return this.data.counter;
    }

    get(channelId) {
        if (!channelId) return null;
        return this.data.tickets[channelId] || null;
    }

    upsert(ticket) {
        if (!ticket || !ticket.channelId) {
            return null;
        }

        const existing = this.data.tickets[ticket.channelId] || {};
        const merged = { ...existing, ...ticket };
        this.data.tickets[ticket.channelId] = merged;

        const num = Math.floor(Number(merged.number));
        if (Number.isFinite(num) && num > this.data.counter) {
            this.data.counter = num;
        }

        this.save();
        return merged;
    }

    update(channelId, patch) {
        if (!channelId || !this.data.tickets[channelId]) {
            return null;
        }

        const updated = {
            ...this.data.tickets[channelId],
            ...(patch || {})
        };
        this.data.tickets[channelId] = updated;
        this.save();
        return updated;
    }

    findOpen(ownerId, typeId) {
        if (!ownerId) return null;
        return Object.values(this.data.tickets).find(ticket =>
            ticket &&
            ticket.status === "open" &&
            ticket.ownerId === ownerId &&
            (!typeId || ticket.type === typeId)
        ) || null;
    }

    listOpen() {
        return Object.values(this.data.tickets).filter(ticket => ticket && ticket.status === "open");
    }

    markClosed(channelId, { closedBy = null, reason = null } = {}) {
        return this.update(channelId, {
            status: "closed",
            closedAt: new Date().toISOString(),
            closedBy: closedBy ?? null,
            closeReason: reason ?? null
        });
    }

    getPanel() {
        return {
            channelId: this.data.panel?.channelId || null,
            messageId: this.data.panel?.messageId || null
        };
    }

    setPanel(channelId, messageId) {
        this.data.panel = {
            channelId: channelId || null,
            messageId: messageId || null
        };
        this.save();
        return this.getPanel();
    }
}

module.exports = {
    TicketStore,
    DEFAULT_DATA_FILE
};
