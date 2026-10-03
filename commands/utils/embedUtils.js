const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

function parseColor(color) {

    if (!color) {
        return 0x5865F2;
    }

    color = color.trim().replace("#", "");

    if (!/^[0-9A-Fa-f]{6}$/.test(color)) {
        return null;
    }

    return parseInt(color, 16);
}

function isValidUrl(value) {

    if (!value) {
        return false;
    }

    try {

        const url = new URL(value);

        return (
            url.protocol === "http:" ||
            url.protocol === "https:"
        );

    } catch {

        return false;
    }
}

function createButton(label, url) {

    if (!label || !url) {
        return null;
    }

    if (!isValidUrl(url)) {
        return null;
    }

    return new ButtonBuilder()
        .setLabel(label)
        .setURL(url)
        .setStyle(ButtonStyle.Link);
}

function createEmbed(options = {}) {

    const {
        title,
        description,
        color,
        url,
        image,
        thumbnail,
        footer,
        author,
        authorIcon,
        timestamp = false
    } = options;

    const embed = new EmbedBuilder();

    if (title) {
        embed.setTitle(title);
    }

    if (description) {
        embed.setDescription(description);
    }

    const parsedColor = parseColor(color);

    if (parsedColor !== null) {
        embed.setColor(parsedColor);
    } else {
        embed.setColor(0x5865F2);
    }

    if (url && isValidUrl(url)) {
        embed.setURL(url);
    }

    if (image && isValidUrl(image)) {
        embed.setImage(image);
    }

    if (thumbnail && isValidUrl(thumbnail)) {
        embed.setThumbnail(thumbnail);
    }

    if (author) {

        const authorData = {
            name: author
        };

        if (authorIcon && isValidUrl(authorIcon)) {
            authorData.iconURL = authorIcon;
        }

        embed.setAuthor(authorData);
    }

    if (footer) {
        embed.setFooter({
            text: footer
        });
    }

    if (timestamp) {
        embed.setTimestamp();
    }

    return embed;
}

function createButtons(buttons = []) {

    const validButtons = buttons
        .map(button =>
            createButton(
                button.label,
                button.url
            )
        )
        .filter(Boolean);

    if (validButtons.length === 0) {
        return [];
    }

    return [
        new ActionRowBuilder().addComponents(
            validButtons
        )
    ];
}

module.exports = {
    parseColor,
    isValidUrl,
    createEmbed,
    createButtons
};
