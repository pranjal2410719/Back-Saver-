import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const dataFile = path.join(process.cwd(), 'data.json');

async function ensureDataFile() {
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify({ urls: [] }));
  }
}

export async function GET() {
  try {
    await ensureDataFile();
    const data = await fs.readFile(dataFile, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (err: any) {
    return NextResponse.json({ urls: [] });
  }
}

export async function POST(request: Request) {
  try {
    const { urls } = await request.json();
    await ensureDataFile();
    await fs.writeFile(dataFile, JSON.stringify({ urls }));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
