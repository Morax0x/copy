// commands/family/tree.js

const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const Canvas = require('canvas');
const path = require('path');

// ✅✅ إعدادات النظام ✅✅
const TEST_MODE = false;
const CHILDREN_PER_PAGE = 10; // 10 أبناء في الصفحة الواحدة

// الألوان
const THEME = {
    BG_TOP: "#14161f",
    BG_BOT: "#0a0b10",
    GRID: "rgba(255, 255, 255, 0.03)",
    MALE: "#00a8ff",
    FEMALE: "#ff0055",
    DEFAULT: "#00ff88",
    GOLD: "#ffd700",
    LINE: "#cfd8dc",
    TEXT: "#ffffff",
    NAME_BG: "rgba(0, 0, 0, 0.85)"
};

// الأبعاد
const DIMS = {
    NODE: 80, PARTNER: 65, KID: 60, GRAND: 45, PARENT: 70, SIBLING: 60,
    LEVEL_GAP: 250, SIB_GAP: 30,
};

// الإحداثيات
const Y_PARENTS = 120;
const Y_MAIN = Y_PARENTS + DIMS.LEVEL_GAP;
const Y_KIDS = Y_MAIN + DIMS.LEVEL_GAP;
const Y_GRAND = Y_KIDS + DIMS.LEVEL_GAP;
const CANVAS_HEIGHT = Y_GRAND + DIMS.GRAND + 80;

// ==========================================
// 🛠️ الدوال المساعدة (يجب أن تكون هنا بالأعلى)
// ==========================================

// دالة جلب لون العضو
async function getUserColor(client, userId, guild) {
    if (TEST_MODE) return THEME.DEFAULT;
    try {
        const sql = client.sql;
        const config = sql.prepare("SELECT * FROM family_config WHERE guildID = ?").get(guild.id);
        if (!config) return THEME.DEFAULT;
        
        let member = guild.members.cache.get(userId);
        if (!member) member = await guild.members.fetch(userId).catch(() => null);
        if (!member) return THEME.DEFAULT;
        
        const checkRole = (rolesData) => {
            if (!rolesData) return false;
            try {
                const roleIds = JSON.parse(rolesData);
                if (Array.isArray(roleIds)) return roleIds.some(id => member.roles.cache.has(id));
            } catch {
                return member.roles.cache.has(rolesData);
            }
            return false;
        };

        if (checkRole(config.maleRole)) return THEME.MALE;
        if (checkRole(config.femaleRole)) return THEME.FEMALE;
        return THEME.DEFAULT;
    } catch { return THEME.DEFAULT; }
}

// ==========================================
// 🎨 المحرك الرسومي
// ==========================================
async function drawTreePage(treeData, pageIndex) {
    const start = pageIndex * CHILDREN_PER_PAGE;
    const end = start + CHILDREN_PER_PAGE;
    const currentChildren = treeData.children.slice(start, end);

    let childBlocks = [];
    let childrenTotalWidth = 0;

    for (let child of currentChildren) {
        const spouseW = (child.partners.length * (DIMS.PARTNER * 2 + 10));
        const topW = (DIMS.KID * 2) + spouseW;
        const grandCount = child.offspring.length;
        const botW = grandCount * (DIMS.GRAND * 2 + 5);
        const blockW = Math.max(topW, botW, DIMS.KID * 2.5);
        
        childBlocks.push({ data: child, width: blockW, spouseW: spouseW });
        childrenTotalWidth += blockW + DIMS.SIB_GAP;
    }

    const leftSiblingsWidth = treeData.siblings.left.length * (DIMS.SIBLING * 2 + 15);
    const rightSiblingsWidth = treeData.siblings.right.length * (DIMS.SIBLING * 2 + 15);
    const parentsWidth = (treeData.parents.length * (DIMS.PARENT * 2 + 40));
    const partnersWidth = (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + (DIMS.NODE * 2);
    const mainRowWidth = partnersWidth + leftSiblingsWidth + rightSiblingsWidth + 150;

    const canvasWidth = Math.max(childrenTotalWidth, mainRowWidth, parentsWidth, 1400) + 100;
    const centerX = canvasWidth / 2;

    const canvas = Canvas.createCanvas(canvasWidth, CANVAS_HEIGHT);
    const ctx = canvas.getContext('2d');

    // الخلفية
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, THEME.BG_TOP);
    grad.addColorStop(1, THEME.BG_BOT);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    // الشبكة
    ctx.lineWidth = 1;
    ctx.strokeStyle = THEME.GRID;
    const gridSize = 50;
    for(let x=0; x<canvasWidth; x+=gridSize) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CANVAS_HEIGHT); ctx.stroke(); }
    for(let y=0; y<CANVAS_HEIGHT; y+=gridSize) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvasWidth,y); ctx.stroke(); }

    const radGrad = ctx.createRadialGradient(centerX, CANVAS_HEIGHT/2, 100, centerX, CANVAS_HEIGHT/2, canvasWidth);
    radGrad.addColorStop(0, "rgba(0,0,0,0)");
    radGrad.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    // --- دوال الرسم الداخلية ---
    function drawNameLabel(name, x, y, color) {
        const fontSize = 18;
        ctx.font = `bold ${fontSize}px "Sans", "Arial"`;
        const textMetrics = ctx.measureText(name);
        const boxWidth = textMetrics.width + 20;
        const boxHeight = 35;
        const boxX = x - (boxWidth / 2);
        const boxY = y + 15;

        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 5;
        ctx.fillStyle = THEME.NAME_BG;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
        else ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.fillStyle = THEME.TEXT;
        ctx.textAlign = "center";
        ctx.fillText(name, x, boxY + 24);
    }

    async function drawCircleImg(user, x, y, radius, isMain=false) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        try {
            const img = await Canvas.loadImage(user.avatarURL);
            ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
        } catch (err) {
            ctx.fillStyle = "#2c3e50";
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.lineWidth = isMain ? 6 : 4;
        ctx.strokeStyle = isMain ? THEME.GOLD : (user.color || THEME.DEFAULT);
        ctx.stroke();
        
        const name = user.username || "???";
        const shortName = name.length > 12 ? name.substring(0, 10)+".." : name;
        drawNameLabel(shortName, x, y + radius, isMain ? THEME.GOLD : (user.color || THEME.DEFAULT));
    }

    function drawLine(x1, y1, x2, y2, color=THEME.LINE, width=3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.shadowColor = "rgba(0,0,0,0.8)";
        ctx.shadowBlur = 2;
        ctx.stroke();
        ctx.restore();
    }

    function drawElbow(x1, y1, x2, y2, color=THEME.LINE) {
        const midY = (y1 + y2) / 2;
        drawLine(x1, y1, x1, midY, color);
        drawLine(x1, midY, x2, midY, color);
        drawLine(x2, midY, x2, y2, color);
    }

    // --- الطبقة 1: الخطوط ---
    if (treeData.parents.length > 0) {
        const pTotalW = treeData.parents.length * (DIMS.PARENT * 2 + 40);
        let currentPX = centerX - (pTotalW / 2) + DIMS.PARENT + 20;
        for(const p of treeData.parents) {
            drawLine(currentPX, Y_PARENTS + DIMS.PARENT, centerX, Y_MAIN - DIMS.NODE - 40);
            currentPX += DIMS.PARENT * 2 + 40;
        }
    }

    const siblingsLineY = Y_MAIN - DIMS.NODE - 60;
    let sX = centerX - DIMS.NODE - 60;
    for(const sib of treeData.siblings.left) {
        drawLine(centerX, siblingsLineY, sX, siblingsLineY);
        drawLine(sX, siblingsLineY, sX, Y_MAIN - DIMS.SIBLING);
        sX -= (DIMS.SIBLING * 2 + 20);
    }
    let rightStart = centerX + DIMS.NODE + (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + 60;
    for(const sib of treeData.siblings.right) {
        drawLine(centerX, siblingsLineY, rightStart, siblingsLineY);
        drawLine(rightStart, siblingsLineY, rightStart, Y_MAIN - DIMS.SIBLING);
        rightStart += (DIMS.SIBLING * 2 + 20);
    }
    if (treeData.siblings.left.length > 0 || treeData.siblings.right.length > 0) {
        drawLine(centerX, siblingsLineY, centerX, Y_MAIN - DIMS.NODE);
    }

    let pX = centerX + DIMS.NODE + 40;
    treeData.partners.forEach((p) => {
        drawLine(centerX + DIMS.NODE, Y_MAIN, pX - DIMS.PARTNER, Y_MAIN, THEME.FEMALE);
        pX += DIMS.PARTNER * 2 + 20;
    });

    if (childBlocks.length > 0) {
        drawElbow(centerX, Y_MAIN + DIMS.NODE, centerX, Y_KIDS - DIMS.KID - 40);
        let currentX = centerX - (childrenTotalWidth / 2);
        for(const block of childBlocks) {
            const blockCenter = currentX + (block.width / 2);
            const kidRealX = blockCenter - (block.spouseW / 2);
            drawElbow(centerX, Y_MAIN + DIMS.NODE, kidRealX, Y_KIDS - DIMS.KID);
            
            let spX = kidRealX + DIMS.KID + 20;
            let lastSpouseX = kidRealX;
            if (block.data.partners) {
                for (const sp of block.data.partners) {
                    drawLine(kidRealX + DIMS.KID, Y_KIDS, spX - DIMS.PARTNER, Y_KIDS, THEME.FEMALE);
                    lastSpouseX = spX;
                    spX += DIMS.PARTNER * 2 + 10;
                }
            }

            let parentsCenterX = (kidRealX + lastSpouseX) / 2;
            if (block.data.offspring.length > 0) {
                const grandCount = block.data.offspring.length;
                let grandX = blockCenter - ((grandCount * (DIMS.GRAND * 2 + 5)) / 2) + DIMS.GRAND;
                for (const grand of block.data.offspring) {
                    drawElbow(parentsCenterX, Y_KIDS + DIMS.KID, grandX, Y_GRAND - DIMS.GRAND);
                    grandX += DIMS.GRAND * 2 + 5;
                }
            }
            currentX += block.width + DIMS.SIB_GAP;
        }
    }

    // --- الطبقة 2: الصور ---
    if (treeData.parents.length > 0) {
        const pTotalW = treeData.parents.length * (DIMS.PARENT * 2 + 40);
        let currentPX = centerX - (pTotalW / 2) + DIMS.PARENT + 20;
        for(const parent of treeData.parents) {
            await drawCircleImg(parent, currentPX, Y_PARENTS, DIMS.PARENT);
            currentPX += DIMS.PARENT * 2 + 40;
        }
    }

    sX = centerX - DIMS.NODE - 60;
    for(const sib of treeData.siblings.left) {
        await drawCircleImg(sib, sX, Y_MAIN, DIMS.SIBLING);
        sX -= (DIMS.SIBLING * 2 + 20);
    }

    await drawCircleImg(treeData.main, centerX, Y_MAIN, DIMS.NODE, true);

    pX = centerX + DIMS.NODE + 40;
    for(const p of treeData.partners) {
        await drawCircleImg(p, pX, Y_MAIN, DIMS.PARTNER);
        pX += DIMS.PARTNER * 2 + 20;
    }

    rightStart = centerX + DIMS.NODE + (treeData.partners.length * (DIMS.PARTNER * 2 + 20)) + 60;
    for(const sib of treeData.siblings.right) {
        await drawCircleImg(sib, rightStart, Y_MAIN, DIMS.SIBLING);
        rightStart += (DIMS.SIBLING * 2 + 20);
    }

    let currentX = centerX - (childrenTotalWidth / 2);
    for(const block of childBlocks) {
        const blockCenter = currentX + (block.width / 2);
        const kidRealX = blockCenter - (block.spouseW / 2);
        
        await drawCircleImg(block.data, kidRealX, Y_KIDS, DIMS.KID);

        let spX = kidRealX + DIMS.KID + 20;
        if (block.data.partners) {
            for (const sp of block.data.partners) {
                await drawCircleImg(sp, spX, Y_KIDS, DIMS.PARTNER);
                spX += DIMS.PARTNER * 2 + 10;
            }
        }

        if (block.data.offspring.length > 0) {
            const grandCount = block.data.offspring.length;
            let grandX = blockCenter - ((grandCount * (DIMS.GRAND * 2 + 5)) / 2) + DIMS.GRAND;
            for (const grand of block.data.offspring) {
                await drawCircleImg(grand, grandX, Y_GRAND, DIMS.GRAND);
                grandX += DIMS.GRAND * 2 + 5;
            }
        }
        currentX += block.width + DIMS.SIB_GAP;
    }

    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = '20px "Sans", "Arial"';
    ctx.fillText(`الصفحة ${pageIndex + 1}`, canvasWidth - 80, CANVAS_HEIGHT - 30);

    return new AttachmentBuilder(canvas.toBuffer(), { name: 'family-tree.png' });
}

module.exports = {
    name: 'tree',
    description: 'عرض شجرة العائلة (سريع وشامل)',
    aliases: ['شجرة', 'family'],
    
    async execute(message, args) {
        const client = message.client;
        const guild = message.guild;
        const sql = client.sql;

        const targetMember = message.mentions.members.first() || 
                             message.guild.members.cache.get(args[0]) || 
                             message.member;
                             
        const targetUser = targetMember.user;

        // 🔥🔥 1. تجميع كل الآيديات المطلوبة (Bulk ID Collection) 🔥🔥
        const allInvolvedUserIds = new Set();
        allInvolvedUserIds.add(targetUser.id);

        // -- الآباء --
        const parentRows = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(targetUser.id, guild.id);
        const parentIDs = parentRows.map(r => r.parentID);
        parentIDs.forEach(id => allInvolvedUserIds.add(id));

        // -- الأخوة (أبناء الآباء) --
        let siblingIDs = [];
        if (parentIDs.length > 0) {
            const placeholders = parentIDs.map(() => '?').join(',');
            const sibRows = sql.prepare(`
                SELECT DISTINCT childID FROM children 
                WHERE parentID IN (${placeholders}) 
                AND childID != ? AND guildID = ?
            `).all(...parentIDs, targetUser.id, guild.id);
            siblingIDs = sibRows.map(r => r.childID);
            siblingIDs.forEach(id => allInvolvedUserIds.add(id));
        }

        // -- الزوجات --
        const partnersRows = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(targetUser.id, guild.id);
        const partnerIDs = partnersRows.map(r => r.partnerID);
        partnerIDs.forEach(id => allInvolvedUserIds.add(id));

        // -- الأبناء (مباشرين + من الزوجات) --
        const myKidsRows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(targetUser.id, guild.id);
        const stepKidsRows = [];
        partnerIDs.forEach(pid => {
            const rows = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(pid, guild.id);
            stepKidsRows.push(...rows);
        });
        
        const childrenIDs = new Set([...myKidsRows.map(r => r.childID), ...stepKidsRows.map(r => r.childID)]);
        childrenIDs.forEach(id => allInvolvedUserIds.add(id));

        // -- زوجات الأبناء + الأحفاد --
        const childArr = Array.from(childrenIDs);
        const childPartnerMap = new Map(); // childID -> [partnerID, ...]
        const grandchildMap = new Map(); // childID -> [grandchildID, ...]

        if (childArr.length > 0) {
            for (const cid of childArr) {
                const cMarriages = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").all(cid, guild.id);
                const cPids = cMarriages.map(r => r.partnerID);
                childPartnerMap.set(cid, cPids);
                cPids.forEach(id => allInvolvedUserIds.add(id));

                // الأحفاد
                const g1 = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(cid, guild.id);
                let gIds = g1.map(r => r.childID);
                
                for (const cpid of cPids) {
                    const g2 = sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(cpid, guild.id);
                    gIds.push(...g2.map(r => r.childID));
                }
                gIds = [...new Set(gIds)];
                grandchildMap.set(cid, gIds);
                gIds.forEach(id => allInvolvedUserIds.add(id));
            }
        }

        // 🔥🔥 2. جلب بيانات المستخدمين من ديسكورد دفعة واحدة 🔥🔥
        const allIDsArray = Array.from(allInvolvedUserIds);
        let membersMap = new Map(); 

        try {
            const fetchedMembers = await guild.members.fetch({ user: allIDsArray });
            fetchedMembers.forEach(m => membersMap.set(m.id, m));
        } catch (e) {
            console.error("Bulk Fetch Error (Fallback to cache):", e);
            allIDsArray.forEach(id => {
                const m = guild.members.cache.get(id);
                if (m) membersMap.set(id, m);
            });
        }

        // دالة لتجهيز كائن العضو (تستخدم getUserColor المعرفة بالأعلى)
        const prepareUserObj = async (id) => {
            const m = membersMap.get(id);
            if (!m) return null;
            const color = await getUserColor(client, id, guild);
            return {
                username: m.user.username,
                id: id,
                color: color,
                avatarURL: m.user.displayAvatarURL({ extension: 'png' })
            };
        };

        // 🔥🔥 3. بناء هيكل الشجرة النهائي 🔥🔥
        const mainUserObj = await prepareUserObj(targetUser.id);
        if (!mainUserObj) return message.reply("❌ تعذر العثور على بيانات المستخدم.");

        let treeData = {
            main: mainUserObj,
            parents: [],
            partners: [],
            children: [],
            siblings: { left: [], right: [] }
        };

        for (const pid of parentIDs) {
            const u = await prepareUserObj(pid);
            if (u) treeData.parents.push(u);
        }

        for (let i = 0; i < siblingIDs.length; i++) {
            const u = await prepareUserObj(siblingIDs[i]);
            if (u) {
                if (i % 2 === 0) treeData.siblings.left.push(u);
                else treeData.siblings.right.push(u);
            }
        }

        for (const pid of partnerIDs) {
            const u = await prepareUserObj(pid);
            if (u) treeData.partners.push(u);
        }

        for (const cid of childArr) {
            const childObj = await prepareUserObj(cid);
            if (!childObj) continue;

            const cPartnerIDs = childPartnerMap.get(cid) || [];
            let cPartnersObjs = [];
            for (const cpid of cPartnerIDs) {
                const u = await prepareUserObj(cpid);
                if (u) cPartnersObjs.push(u);
            }

            const gIDs = grandchildMap.get(cid) || [];
            let grandObjs = [];
            for (const gid of gIDs) {
                const u = await prepareUserObj(gid);
                if (u) grandObjs.push(u);
            }

            treeData.children.push({
                ...childObj,
                partners: cPartnersObjs,
                offspring: grandObjs
            });
        }

        // التحقق من خلو الشجرة
        if (treeData.parents.length === 0 && treeData.partners.length === 0 && treeData.children.length === 0 && treeData.siblings.left.length === 0 && treeData.siblings.right.length === 0) {
            const msg = await message.reply({ content: `🍂 **شجرة ${targetUser.username} فارغة تماماً!**` });
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return; 
        }

        // 🔥🔥 4. الرسم والعرض 🔥🔥
        let currentPage = 0;
        const totalPages = Math.ceil(treeData.children.length / CHILDREN_PER_PAGE) || 1;

        const getButtons = (page) => {
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder().setCustomId('prev_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164494759723029').setDisabled(page === 0),
                new ButtonBuilder().setCustomId('next_tree').setStyle(ButtonStyle.Secondary).setEmoji('1439164491072929915').setDisabled(page >= totalPages - 1)
            );
            return row;
        };

        const img = await drawTreePage(treeData, currentPage);
        const msg = await message.reply({ 
            files: [img],
            components: totalPages > 1 ? [getButtons(currentPage)] : []
        });

        if (totalPages <= 1) return;

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === message.author.id, 
            time: 300000,
            componentType: ComponentType.Button 
        });

        collector.on('collect', async i => {
            if (i.customId === 'prev_tree') currentPage--;
            if (i.customId === 'next_tree') currentPage++;
            await i.deferUpdate();
            const newImg = await drawTreePage(treeData, currentPage);
            await i.editReply({ files: [newImg], components: [getButtons(currentPage)] });
        });

        collector.on('end', () => msg.edit({ components: [] }).catch(()=>{}));
    }
};
