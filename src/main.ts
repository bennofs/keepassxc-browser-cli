#!/usr/bin/env node
import {KeepassXCConnection} from "./KeepassXCConnection";
import {Configuration} from "./Configuration";
import {Command} from "commander";

enum CommandType {
    GetLogin,
    GetPassword,
}

interface GetLoginData {
    type: CommandType.GetLogin;
    url: string;
    all: boolean;
}

interface GetPasswordData {
    type: CommandType.GetPassword;
    url: string;
    login?: string;
}

type CommandData = GetLoginData | GetPasswordData;

async function associate(config: Configuration, connection: KeepassXCConnection) {
    const dbHash = await connection.getDatabaseHash();

    // If we do not know this database yet or if the associate test fails, associate again
    if (!config.hasKey(dbHash) || !await connection.testAssociate(config.getKey(dbHash).id,
                                                                  config.getKey(dbHash).idKey)) {
        const associateRes = await connection.associate();

        config.saveKey(associateRes.dbHash, {
            id: associateRes.id,
            idKey: associateRes.idKey
        });
    }
}

async function main() {
    const config = new Configuration();

    await config.load();

    const program = new Command();
    program.version("1.0.0");

    let command: CommandData = null;

    program.command("get-login <url>")
           .description("Gets the login name for the specified URL.")
           .option('-a, --all', 'Display all matching entries, not just the first.')
           .action((url, opts) => command = {
               type: CommandType.GetLogin,
               url: url,
               all: opts.all,
           });
    program.command("get-pw <url>")
           .description("Gets the password for the specified URL.")
           .option('-l, --login <login>', 'Get password for the entry with the specified login, instead of the first matching one')
           .action((url, opts) => command = {
               type: CommandType.GetPassword,
               url: url,
               login: opts.login,
           });

    program.parse(process.argv);

    if (!command) {
        throw new Error("No command specified!");
    }

    const connection = await KeepassXCConnection.create();
    try {
        await associate(config, connection);

        switch (command.type) {
            case CommandType.GetLogin:
            case CommandType.GetPassword: {
                const logins = await connection.getLogins(command.url);

                if (logins.length === 0) {
                    throw new Error("No entries found for URL.");
                }

                if (command.type === CommandType.GetLogin) {
                    if (command.all) {
                        for (const login of logins) {
                            console.log(login.login);
                        }
                    } else {
                        console.log(logins[0].login);
                    }
                } else {
                    if (command.login) {
                        let found = null;
                        for (const login of logins) {
                            if (login.login == command.login) {
                                found = login;
                                break;
                            }
                        }

                        if (found == null) {
                            throw new Error("No entry found for login name " + command.login + ".")
                        }

                        console.log(found.password)
                    } else {
                        console.log(logins[0].password);
                    }
                }
                break;
            }

        }
    } finally {
        connection.disconnect();

        await config.save();
    }
}

main().then(() => {
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
