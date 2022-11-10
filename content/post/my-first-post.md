---
title: "Writing a driver"
date: 2021-08-01T15:29:44+10:00
draft: false
---

How can I learn: A) what a driver really is, and B) how to write one?

Starting with https://lwn.net/Kernel/LDD3/

The linux kernel can load or unload pieces of software called `modules`. Devices drivers typically come in the form of a module.

Char, block, network

Char - stream of data
Block - have a filesystem on them
Network - network interfaces send and receive data packets

To get started developing a module, we need to download the source code of the linux kernel:

```
git clone https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git
```


If we make mistakes in the code, this could crash our computer, so running our module in a virtual machine is a nice idea. 

Download qemu: `pacman -S qemu-desktop`


```
fn main() {
	0
}
```
