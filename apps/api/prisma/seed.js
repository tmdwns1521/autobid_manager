"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const workspace = await prisma.workspace.upsert({
        where: { id: 'default-workspace' },
        create: {
            id: 'default-workspace',
            name: '기본 워크스페이스',
            owner: {
                create: {
                    id: 'default-user',
                    name: '관리자',
                    email: 'admin@autobid.kr',
                    passwordHash: 'temp',
                },
            },
        },
        update: {},
    });
    console.log('워크스페이스 생성:', workspace.name);
}
main().finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map