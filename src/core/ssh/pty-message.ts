import { Buffer } from 'buffer';
import {
  ChannelRequestMessage,
  ChannelRequestType,
  SshDataReader,
  SshDataWriter,
} from '@microsoft/dev-tunnels-ssh';

/**
 * SSH_MSG_CHANNEL_REQUEST pty-req payload for interactive terminals.
 */
export class PtyRequestMessage extends ChannelRequestMessage {
  term = 'xterm-256color';
  widthChars = 120;
  heightRows = 40;
  widthPixels = 0;
  heightPixels = 0;
  /** Encoded terminal modes (empty = none) */
  modes: Buffer = Buffer.alloc(0);

  constructor() {
    super(ChannelRequestType.terminal, true);
  }

  protected onRead(reader: SshDataReader): void {
    super.onRead(reader);
    this.term = reader.readString('utf8');
    this.widthChars = reader.readUInt32();
    this.heightRows = reader.readUInt32();
    this.widthPixels = reader.readUInt32();
    this.heightPixels = reader.readUInt32();
    this.modes = reader.readBinary();
  }

  protected onWrite(writer: SshDataWriter): void {
    super.onWrite(writer);
    writer.writeString(this.term, 'utf8');
    writer.writeUInt32(this.widthChars);
    writer.writeUInt32(this.heightRows);
    writer.writeUInt32(this.widthPixels);
    writer.writeUInt32(this.heightPixels);
    // Write bytes individually instead of passing a Buffer across package/runtime
    // boundaries. Browser Buffer polyfills and Node's native Buffer are not always
    // recognized as the same class by SshDataWriter.
    writer.writeUInt32(this.modes.byteLength);
    for (const mode of this.modes) writer.writeByte(mode);
  }
}

/**
 * window-change channel request for terminal resize.
 */
export class WindowChangeMessage extends ChannelRequestMessage {
  widthChars = 120;
  heightRows = 40;
  widthPixels = 0;
  heightPixels = 0;

  constructor() {
    super('window-change', false);
  }

  protected onRead(reader: SshDataReader): void {
    super.onRead(reader);
    this.widthChars = reader.readUInt32();
    this.heightRows = reader.readUInt32();
    this.widthPixels = reader.readUInt32();
    this.heightPixels = reader.readUInt32();
  }

  protected onWrite(writer: SshDataWriter): void {
    super.onWrite(writer);
    writer.writeUInt32(this.widthChars);
    writer.writeUInt32(this.heightRows);
    writer.writeUInt32(this.widthPixels);
    writer.writeUInt32(this.heightPixels);
  }
}
